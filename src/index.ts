import dotenv from 'dotenv';
import { S3MigrationService } from './services/s3-migration.service';
import { S3Config } from './types/s3-migration.interface';
import { logger } from './utils/logger';

dotenv.config();

async function main() {
  const sourceConfig: S3Config = {
    region: process.env.SOURCE_AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.SOURCE_AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.SOURCE_AWS_SECRET_ACCESS_KEY || '',
    },
  };

  const destinationConfig: S3Config = {
    region: process.env.DESTINATION_AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.DESTINATION_AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.DESTINATION_AWS_SECRET_ACCESS_KEY || '',
    },
  };

  const sourceBucket = process.env.SOURCE_BUCKET || '';
  const destinationBucket = process.env.DESTINATION_BUCKET || '';

  if (!sourceBucket || !destinationBucket) {
    throw new Error('Source and destination bucket names are required');
  }

  const migrationService = new S3MigrationService();

  try {
    logger.info('Starting S3 migration...');
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

    logger.info('Migration completed successfully', { summary });
    console.table(summary);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

main();
