import { Kafka } from 'kafkajs';
import { KAFKA_BROKERS, KAFKA_TOPIC, DOMAIN } from './config.js';
import { createLogger, attachKafkaEvents } from './observe.js';

const log = createLogger('kafka');

const kafka = new Kafka({ clientId: `olx-scraper-${DOMAIN}`, brokers: KAFKA_BROKERS });
const producer = kafka.producer();
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
    event:      eventType,
    platform:   DOMAIN,
    scraped_at: new Date().toISOString(),
    ...data,
  };
  await producer.send({
    topic: KAFKA_TOPIC,
    messages: [{ key: String(data.listing_id ?? ''), value: JSON.stringify(message) }],
  });
}

export async function disconnect() {
  if (connected) await producer.disconnect();
}
