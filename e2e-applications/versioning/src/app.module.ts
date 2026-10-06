import {
  All,
  Controller,
  Get,
  Module,
  Version,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import {
  ApiExtension,
  ApiExtraModels,
  ApiHideProperty,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';

export class CatDto {
  @ApiProperty()
  name: string;

  @ApiHideProperty()
  internalNotes: string;
}

// Registered with @ApiExtraModels; no operation references it
export class CatEventDto {
  @ApiProperty()
  type: string;
}

@Controller({ path: 'cats', version: '1' })
@ApiTags('Cats')
@ApiExtension('x-team', 'felines')
@ApiExtraModels(CatEventDto)
export class CatsController {
  @Get()
  @ApiExtension('x-team', 'cats-core')
  @ApiExtension('x-rate-limit', { perMinute: 60 })
  list(): CatDto[] {
    return [];
  }

  @Get(':id')
  @Version('2')
  @ApiTags('Lookup')
  @ApiOperation({ summary: 'One cat', deprecated: true })
  get(): CatDto {
    return null as never;
  }

  @Get('both')
  @Version(['1', '2'])
  both(): string {
    return '';
  }

  @Get('neutral')
  @Version(VERSION_NEUTRAL)
  neutral(): string {
    return '';
  }
}

@Controller('dogs')
export class DogsController {
  // No version declared: defaultVersion from the config applies
  @Get()
  list(): string {
    return '';
  }

  @All('any')
  any(): string {
    return '';
  }
}

@Controller(['birds', 'parrots'])
export class BirdsController {
  @Get(['', 'all'])
  list(): string {
    return '';
  }
}

@Module({ controllers: [CatsController, DogsController, BirdsController] })
export class AppModule {}
