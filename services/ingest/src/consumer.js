import { Kafka, logLevel } from 'kafkajs';
import { KAFKA_BROKERS, KAFKA_GROUP, KAFKA_TOPICS } from './config.js';
import { normalizeEvent } from './normalize.js';
import { ingestRow } from './ingest.js';

const log = {
  info:  (msg, extra) => process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level: 'info',  component: 'consumer', msg, ...extra }) + '\n'),
  error: (msg, extra) => process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level: 'error', component: 'consumer', msg, ...extra }) + '\n'),
};

const kafka = new Kafka({
  clientId: 'ingest',
  brokers: KAFKA_BROKERS,
  logLevel: logLevel.WARN,
});

const consumer = kafka.consumer({ groupId: KAFKA_GROUP });

let stats = { processed: 0, errors: 0 };

export async function startConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topics: KAFKA_TOPICS, fromBeginning: false });

  log.info(`subscribed to ${KAFKA_TOPICS.length} topics`, { topics: KAFKA_TOPICS });

  // Log stats periodically
  setInterval(() => {
    if (stats.processed > 0 || stats.errors > 0) {
      log.info('stats', { processed: stats.processed, errors: stats.errors });
      stats = { processed: 0, errors: 0 };
    }
  }, 60_000);

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      let event;
      try {
        event = JSON.parse(message.value.toString());
      } catch (err) {
        log.error('malformed message', { topic, offset: message.offset, err: err.message });
        stats.errors++;
        return;
      }

      try {
        const row = normalizeEvent(event);
        await ingestRow(event.event, row);
        stats.processed++;
      } catch (err) {
        log.error('ingest error', {
          platform: event?.platform,
          listing_id: event?.listing_id,
          event: event?.event,
          err: err.message,
        });
        stats.errors++;
      }
    },
  });
}

export async function stopConsumer() {
  await consumer.disconnect();
}
