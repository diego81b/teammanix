import { Module } from '@nestjs/common';
import { appConfig } from '../config/app.config';
import { StorageFileSystem } from './storage-filesystem';
import { StorageS3 } from './storage-s3';
import { StorageService } from './storage.service';

@Module({
  providers: [
    {
      provide: StorageService,
      useFactory: (): StorageService => {
        const cfg = appConfig();
        return cfg.s3 ? new StorageS3(cfg.s3, cfg.storageKeys) : new StorageFileSystem(cfg.storageDir, cfg.storageKeys);
      },
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
