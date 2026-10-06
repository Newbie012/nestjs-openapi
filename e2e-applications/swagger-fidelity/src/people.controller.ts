import { Body, Controller, Get, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { PropertyOptionsDto } from './properties.dto';
import {
  AddressContactDto,
  CreatePersonDto,
  PatchPersonDto,
  PersonDto,
  PersonNameDto,
  UpdatePersonDto,
} from './people.dto';

// Declared next to the controller, not exported
class PersonListResponse {
  items: PersonDto[];
  total: number;
}

@Controller('people')
export class PeopleController {
  @Get('properties')
  @ApiOperation({
    summary: `Property ${'options'}`,
    description: 'Every @ApiProperty option, ' + 'with Nest precedence',
  })
  properties(): PropertyOptionsDto {
    return null as never;
  }

  @Get()
  list(): PersonListResponse {
    return { items: [], total: 0 };
  }

  @Post()
  create(@Body() body: CreatePersonDto): PersonDto {
    return body as unknown as PersonDto;
  }

  @Put()
  update(@Body() body: UpdatePersonDto): PersonNameDto {
    return body as PersonNameDto;
  }

  @Patch()
  patch(@Body() body: PatchPersonDto): AddressContactDto {
    return body as unknown as AddressContactDto;
  }
}
