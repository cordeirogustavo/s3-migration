import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { S3MigrationService } from './s3-migration.service';
import { S3Config, S3MigrationOptions } from '../types/s3-migration.interface';

vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn();
  return {
    S3Client: vi.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    ListObjectsV2Command: vi.fn(),
    CopyObjectCommand: vi.fn(),
    HeadObjectCommand: vi.fn(),
  };
});

describe('S3MigrationService', () => {
  let service: S3MigrationService;
  let mockOptions: S3MigrationOptions;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new S3MigrationService();
    mockOptions = {
      sourceBucket: 'source-bucket',
      destinationBucket: 'destination-bucket',
      sourceConfig: {} as S3Config,
      destinationConfig: {} as S3Config,
    };
    mockSend = vi.fn();
    (S3Client as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      send: mockSend,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('migrate', () => {
    it('should migrate objects successfully', async () => {
      const mockObjects = [
        { Key: 'file1.txt', Size: 100, LastModified: new Date(), ETag: 'etag1' },
        { Key: 'file2.txt', Size: 200, LastModified: new Date(), ETag: 'etag2' },
      ];

      mockSend.mockImplementation(async (command) => {
        if (command instanceof ListObjectsV2Command) {
          return { Contents: mockObjects };
        }
        if (command instanceof HeadObjectCommand) {
          const error = new Error('NoSuchKey');
          error.name = 'NoSuchKey';
          throw error;
        }
        return {};
      });

      const results = await service.migrate(mockOptions);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('Copied');
      expect(results[1].status).toBe('Copied');
      expect(mockSend).toHaveBeenCalledTimes(5);
    });

    it('should skip existing objects', async () => {
      const mockObjects = [
        { Key: 'file1.txt', Size: 100, LastModified: new Date(), ETag: 'etag1' },
      ];

      mockSend.mockImplementation(async (command) => {
        if (command instanceof ListObjectsV2Command) {
          return { Contents: mockObjects };
        }
        return {};
      });

      const results = await service.migrate(mockOptions);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('Skipped');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should handle errors gracefully', async () => {
      const mockObjects = [
        { Key: 'file1.txt', Size: 100, LastModified: new Date(), ETag: 'etag1' },
      ];

      mockSend.mockImplementation(async (command) => {
        if (command instanceof ListObjectsV2Command) {
          return { Contents: mockObjects };
        }
        if (command instanceof HeadObjectCommand) {
          const error = new Error('NoSuchKey');
          error.name = 'NoSuchKey';
          throw error;
        }
        if (command instanceof CopyObjectCommand) {
          const error = new Error('Copy failed');
          error.name = 'CopyFailed';
          throw error;
        }
        return {};
      });

      const results = await service.migrate(mockOptions);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('Error');
      expect(results[0].error).toBe('Copy failed');
    });
  });
});
