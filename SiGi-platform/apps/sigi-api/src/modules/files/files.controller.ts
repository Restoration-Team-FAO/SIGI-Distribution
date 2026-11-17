import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { getValidatedEnv } from '../../common/config/env';
import { BearerAuthGuard } from '../auth/bearer-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { AuthPrincipal } from '../auth/auth.types';
import { CreateFolderDto } from './dto/create-folder.dto';
import { LinkFileEntityDto } from './dto/link-file-entity.dto';
import { SearchFilesDto } from './dto/search-files.dto';
import { UpdateFileMetadataDto } from './dto/update-file-metadata.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { UploadFileDto } from './dto/upload-file.dto';
import { FilesService } from './files.service';
import { assertSafeUpload } from '../../common/http/upload-policy';

type AuthenticatedRequest = Request & { user?: AuthPrincipal };
const uploadInterceptorOptions = {
  limits: {
    fileSize: getValidatedEnv().fileMaxUploadMb * 1024 * 1024,
  },
};

@UseGuards(BearerAuthGuard)
@Controller('admin/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get('tree')
  @Permissions('files.read')
  async tree(@Req() request: AuthenticatedRequest) {
    return { data: await this.filesService.getTree(request.user, request) };
  }

  @Get('folders/:id/items')
  @Permissions('files.read')
  async folderItems(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return { data: await this.filesService.getFolderItems(id, request.user, request) };
  }

  @Get('root/items')
  @Permissions('files.read')
  async rootItems(@Req() request: AuthenticatedRequest) {
    return { data: await this.filesService.getFolderItems(null, request.user, request) };
  }

  @Post('folders')
  @Permissions('files.create')
  async createFolder(
    @Body() body: CreateFolderDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        folder: await this.filesService.createFolder(body, request.user, request),
      },
    };
  }

  @Patch('folders/:id')
  @Permissions('files.update')
  async updateFolder(
    @Param('id') id: string,
    @Body() body: UpdateFolderDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        folder: await this.filesService.updateFolder(id, body, request.user, request),
      },
    };
  }

  @Delete('folders/:id')
  @Permissions('files.delete')
  async deleteFolder(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return { data: await this.filesService.deleteFolder(id, request.user, request) };
  }

  @Post('upload')
  @Permissions('files.create')
  @UseInterceptors(FileInterceptor('file', uploadInterceptorOptions))
  async upload(
    @UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string; size?: number } | undefined,
    @Body() body: UploadFileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    assertSafeUpload(file, getValidatedEnv().fileAllowedExtensions);
    return {
      data: {
        file: await this.filesService.uploadFile(file, body, request.user, request),
      },
    };
  }

  @Get('search')
  @Permissions('files.read')
  async search(
    @Query() query: SearchFilesDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        files: await this.filesService.searchFiles(query, request.user, request),
      },
    };
  }

  @Get(':id/versions')
  @Permissions('files.read')
  async versions(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        versions: await this.filesService.listVersions(id, request.user, request),
      },
    };
  }

  @Get(':id/audit')
  @Permissions('files.read')
  async audit(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        audit: await this.filesService.getAudit(id, request.user, request),
      },
    };
  }

  @Post(':id/link')
  @Permissions('files.share')
  async link(
    @Param('id') id: string,
    @Body() body: LinkFileEntityDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        link: await this.filesService.linkFile(id, body, request.user, request),
      },
    };
  }

  @Delete(':id/link/:linkId')
  @Permissions('files.share')
  async unlink(
    @Param('id') id: string,
    @Param('linkId') linkId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        link: await this.filesService.unlinkFile(id, linkId, request.user, request),
      },
    };
  }

  @Patch(':id/metadata')
  @Permissions('files.update')
  async updateMetadata(
    @Param('id') id: string,
    @Body() body: UpdateFileMetadataDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const result = await this.filesService.updateFileMetadata(id, body, request.user, request);
    return {
      data: {
        metadata: result.metadata,
        file: result.file,
      },
    };
  }

  @Post(':id/version')
  @Permissions('files.update')
  @UseInterceptors(FileInterceptor('file', uploadInterceptorOptions))
  async createVersion(
    @Param('id') id: string,
    @UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string; size?: number } | undefined,
    @Body() body: UploadFileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    assertSafeUpload(file, getValidatedEnv().fileAllowedExtensions);
    const result = await this.filesService.createVersion(id, file, body, request.user, request);
    return {
      data: {
        versions: result.versions,
        file: result.file,
      },
    };
  }

  @Get(':id/download')
  @Permissions('files.download')
  async download(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.filesService.downloadFile(id, request.user, request);
    response.setHeader('Content-Type', result.file.mimeType ?? 'application/octet-stream');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(result.file.name)}"`,
    );
    return result.stream;
  }

  @Delete(':id')
  @Permissions('files.delete')
  async deleteFile(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return { data: await this.filesService.deleteFile(id, request.user, request) };
  }

  @Get(':id')
  @Permissions('files.read')
  async fileDetail(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      data: {
        file: await this.filesService.getFile(id, request.user, request),
      },
    };
  }
}

@Controller('documents')
export class PublicFilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  async search(@Query('q') q?: string) {
    return {
      data: {
        files: await this.filesService.searchPublicFiles(q),
      },
    };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    return {
      data: {
        file: await this.filesService.getPublicFile(id),
      },
    };
  }

  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.filesService.downloadPublicFile(id);
    response.setHeader('Content-Type', result.file.mimeType ?? 'application/octet-stream');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(result.file.name)}"`,
    );
    return result.stream;
  }
}
