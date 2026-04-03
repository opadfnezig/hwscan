import { Kafka, logLevel } from 'kafkajs';
import { KAFKA_BROKERS, KAFKA_TOPIC, KAFKA_CLIENT_ID } from './config.js';
import { createLogger, attachKafkaEvents } from './observe.js';

const log = createLogger('kafka');

const kafka = new Kafka({
  clientId: KAFKA_CLIENT_ID,
  brokers: KAFKA_BROKERS,
  logLevel: logLevel.WARN,
  retry: { retries: 5 },
});

const producer = kafka.producer({
  allowAutoTopicCreation: true,
});

let connected = false;

async function ensureConnected() {
  if (!connected) {
    await producer.connect();
    attachKafkaEvents(producer, log);
    connected = true;
  }
}

export async function emit(eventType, data) {
  await ensureConnected();
  const message = {
    event: eventType,
    platform: 'bazos.cz',
    scraped_at: new Date().toISOString(),
    ...data,
  };
  await producer.send({
    topic: KAFKA_TOPIC,
    messages: [{
      key: String(data.listing_id ?? ''),
      value: JSON.stringify(message),
    }],
  });
}

export async function disconnectKafka() {
  if (connected) {
    await producer.disconnect();
    connected = false;
  }
}
