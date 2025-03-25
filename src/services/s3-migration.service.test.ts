import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { S3MigrationService } from './s3-migration.service';
import { S3Config, S3MigrationOptions } from '../types/s3-migration.interface';
import { Readable } from 'stream';

vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: vi.fn().mockImplementation(() => ({
      send: vi.fn(),
    })),
    ListObjectsV2Command: vi.fn(),
    GetObjectCommand: vi.fn(),
    HeadObjectCommand: vi.fn(),
  };
});

vi.mock('@aws-sdk/lib-storage', () => {
  return {
    Upload: vi.fn().mockImplementation(() => ({
      done: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('S3MigrationService', () => {
  let service: S3MigrationService;
  let mockOptions: S3MigrationOptions;
  let sourceSendMock: ReturnType<typeof vi.fn>;
  let destinationSendMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new S3MigrationService();
    
    mockOptions = {
      sourceBucket: 'source-bucket',
      destinationBucket: 'destination-bucket',
      sourceConfig: {
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret'
        }
      } as S3Config,
      destinationConfig: {
        region: 'us-east-2',
        credentials: {
          accessKeyId: 'test-key-dest',
          secretAccessKey: 'test-secret-dest'
        }
      } as S3Config,
    };
    
    sourceSendMock = vi.fn();
    destinationSendMock = vi.fn();
    
    vi.clearAllMocks();
    
    (S3Client as unknown as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(() => ({ send: sourceSendMock }))
      .mockImplementationOnce(() => ({ send: destinationSendMock }));
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

      sourceSendMock
        .mockResolvedValueOnce({ Contents: [{ Key: 'test.txt' }] })
        .mockResolvedValueOnce({ Contents: mockObjects })
        .mockResolvedValueOnce({
          Body: new Readable({
            read() {
              this.push('test content 1');
              this.push(null);
            }
          }),
          ContentType: 'text/plain',
          ContentLength: 100,
        })
        .mockResolvedValueOnce({
          Body: new Readable({
            read() {
              this.push('test content 2');
              this.push(null);
            }
          }),
          ContentType: 'text/plain',
          ContentLength: 200,
        });

      destinationSendMock
        .mockResolvedValueOnce({ Contents: [{ Key: 'test.txt' }] })
        .mockRejectedValueOnce(Object.assign(new Error('Not Found'), { name: 'NotFound' }))
        .mockRejectedValueOnce(Object.assign(new Error('Not Found'), { name: 'NotFound' }));

      (Upload as unknown as ReturnType<typeof vi.fn>)
        .mockImplementation(() => ({
          done: vi.fn().mockResolvedValue(undefined),
        }));

      const results = await service.migrate(mockOptions);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe('Copied');
      expect(results[1].status).toBe('Copied');
      
      expect(ListObjectsV2Command).toHaveBeenCalledWith(expect.objectContaining({ 
        Bucket: mockOptions.sourceBucket,
        MaxKeys: 1 
      }));
      
      expect(GetObjectCommand).toHaveBeenNthCalledWith(1, {
        Bucket: mockOptions.sourceBucket,
        Key: 'file1.txt',
      });
      
      expect(GetObjectCommand).toHaveBeenNthCalledWith(2, {
        Bucket: mockOptions.sourceBucket,
        Key: 'file2.txt',
      });
      
      expect(Upload).toHaveBeenCalledTimes(2);
    });

    it('should skip existing objects', async () => {
      const mockObjects = [
        { Key: 'file1.txt', Size: 100, LastModified: new Date(), ETag: 'etag1' },
      ];

      sourceSendMock
        .mockResolvedValueOnce({ Contents: [{ Key: 'test.txt' }] })
        .mockResolvedValueOnce({ Contents: mockObjects });

      destinationSendMock
        .mockResolvedValueOnce({ Contents: [{ Key: 'test.txt' }] })
        .mockResolvedValueOnce({ });

      const results = await service.migrate(mockOptions);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('Skipped');
      expect(results[0].size).toBe(100);
      expect(results[0].lastModified).toBeDefined();
      expect(GetObjectCommand).not.toHaveBeenCalled();
      expect(Upload).not.toHaveBeenCalled();
    });

    it('should handle errors during object transfer', async () => {
      const mockObjects = [
        { Key: 'file1.txt', Size: 100, LastModified: new Date(), ETag: 'etag1' },
      ];

      sourceSendMock
        .mockResolvedValueOnce({ Contents: [{ Key: 'test.txt' }] })
        .mockResolvedValueOnce({ Contents: mockObjects })
        .mockResolvedValueOnce({
          Body: new Readable({
            read() {
              this.push('test content');
              this.push(null);
            }
          }),
          ContentType: 'text/plain',
          ContentLength: 100,
        });

      destinationSendMock
        .mockResolvedValueOnce({ Contents: [{ Key: 'test.txt' }] })
        .mockRejectedValueOnce(Object.assign(new Error('Not Found'), { name: 'NotFound' }));

      (Upload as unknown as ReturnType<typeof vi.fn>)
        .mockImplementation(() => ({
          done: vi.fn().mockRejectedValue(new Error('Upload failed')),
        }));

      const results = await service.migrate(mockOptions);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('Error');
      expect(results[0].error).toBe('Upload failed');
      expect(GetObjectCommand).toHaveBeenCalledTimes(1);
      expect(Upload).toHaveBeenCalledTimes(1);
    });

    it('should handle empty response from source bucket', async () => {
      sourceSendMock
        .mockResolvedValueOnce({ Contents: [{ Key: 'test.txt' }] })
        .mockResolvedValueOnce({ Contents: [] });

      destinationSendMock
        .mockResolvedValueOnce({ Contents: [{ Key: 'test.txt' }] });

      const results = await service.migrate(mockOptions);

      expect(results).toHaveLength(0);
      expect(GetObjectCommand).not.toHaveBeenCalled();
      expect(Upload).not.toHaveBeenCalled();
    });

    it('should handle source bucket access error', async () => {
      sourceSendMock
        .mockRejectedValueOnce(new Error('Access denied'));

      await expect(service.migrate(mockOptions)).rejects.toThrow('Failed to access source bucket: Access denied');
      expect(GetObjectCommand).not.toHaveBeenCalled();
      expect(Upload).not.toHaveBeenCalled();
    });

    it('should handle destination bucket access error', async () => {
      sourceSendMock
        .mockResolvedValueOnce({ Contents: [{ Key: 'test.txt' }] });

      destinationSendMock
        .mockRejectedValueOnce(new Error('Access denied'));

      await expect(service.migrate(mockOptions)).rejects.toThrow('Failed to access destination bucket: Access denied');
      expect(GetObjectCommand).not.toHaveBeenCalled();
      expect(Upload).not.toHaveBeenCalled();
    });
  });
});
