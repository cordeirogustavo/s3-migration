import dotenv from 'dotenv';
import { S3MigrationService } from './services/s3-migration.service';
import { S3Config } from './types/s3-migration.interface';
import { logger } from './utils/logger';

dotenv.config();

function validateEnvVariables() {
  const required = [
    'SOURCE_AWS_REGION',
    'SOURCE_AWS_ACCESS_KEY_ID',
    'SOURCE_AWS_SECRET_ACCESS_KEY',
    'SOURCE_BUCKET',
    'DESTINATION_AWS_REGION',
    'DESTINATION_AWS_ACCESS_KEY_ID',
    'DESTINATION_AWS_SECRET_ACCESS_KEY',
    'DESTINATION_BUCKET'
  ];

  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

async function main() {
  validateEnvVariables();

  const sourceConfig: S3Config = {
    region: process.env.SOURCE_AWS_REGION!,
    credentials: {
      accessKeyId: process.env.SOURCE_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.SOURCE_AWS_SECRET_ACCESS_KEY!,
    },
  };

  const destinationConfig: S3Config = {
    region: process.env.DESTINATION_AWS_REGION!,
    credentials: {
      accessKeyId: process.env.DESTINATION_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.DESTINATION_AWS_SECRET_ACCESS_KEY!,
    },
  };

  const sourceBucket = process.env.SOURCE_BUCKET!;
  const destinationBucket = process.env.DESTINATION_BUCKET!;

  logger.info('Starting migration with configuration:', {
    sourceBucket,
    destinationBucket,
    sourceRegion: sourceConfig.region,
    destinationRegion: destinationConfig.region,
  });

  const migrationService = new S3MigrationService();

  try {
    const results = await migrationService.migrate({
      sourceBucket,
      destinationBucket,
      sourceConfig,
      destinationConfig,
    });

    const summary = {
      total: results.length,
      copied: results.filter((r) => r.status === 'Copied').length,
      skipped: results.filter((r) => r.status === 'Skipped').length,
      errors: results.filter((r) => r.status === 'Error').length,
    };

    logger.info('Migration completed', { summary });
    console.table(summary);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

main();
