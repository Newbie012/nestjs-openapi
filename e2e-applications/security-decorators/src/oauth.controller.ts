import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOAuth2, ApiResponse } from '@nestjs/swagger';

export class ProjectDto {
  id: string;
  name: string;
  description: string;
  ownerId: string;
}

export class CreateProjectDto {
  name: string;
  description: string;
}

/**
 * Controller demonstrating OAuth2 with scopes.
 * Different methods require different OAuth2 scopes.
 */
@ApiTags('Projects')
@Controller('projects')
@ApiOAuth2(['read:projects']) // Controller-level: read scope for all methods
export class OAuthController {
  @Get()
  @ApiOperation({ summary: 'List all projects' })
  @ApiResponse({
    status: 200,
    description: 'List of projects',
    type: [ProjectDto],
  })
  findAll(): ProjectDto[] {
    return [];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by ID' })
  @ApiResponse({ status: 200, description: 'Project found', type: ProjectDto })
  findOne(@Param('id') id: string): ProjectDto {
    return { id, name: 'Project', description: 'Desc', ownerId: '1' };
  }

  /** Requires additional write scope */
  @Post()
  @ApiOAuth2(['read:projects', 'write:projects'])
  @ApiOperation({ summary: 'Create project (requires write scope)' })
  @ApiResponse({
    status: 201,
    description: 'Project created',
    type: ProjectDto,
  })
  create(@Body() dto: CreateProjectDto): ProjectDto {
    return {
      id: '1',
      name: dto.name,
      description: dto.description,
      ownerId: '1',
    };
  }

  /** Requires write scope */
  @Put(':id')
  @ApiOAuth2(['write:projects'])
  @ApiOperation({ summary: 'Update project' })
  @ApiResponse({
    status: 200,
    description: 'Project updated',
    type: ProjectDto,
  })
  update(@Param('id') id: string, @Body() dto: CreateProjectDto): ProjectDto {
    return { id, name: dto.name, description: dto.description, ownerId: '1' };
  }

  /** Requires delete scope */
  @Delete(':id')
  @ApiOAuth2(['delete:projects'])
  @ApiOperation({ summary: 'Delete project (requires delete scope)' })
  @ApiResponse({ status: 204, description: 'Project deleted' })
  delete(@Param('id') _id: string): void {
    // deleted
  }
}
