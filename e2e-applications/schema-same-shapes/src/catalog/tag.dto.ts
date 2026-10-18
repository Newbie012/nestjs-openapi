import { ChoiceDto } from './b/choices.dto';

export interface TagDto {
  slug: string;
}

export interface TagFiltersDto {
  tags: ChoiceDto<TagDto>[];
  names: ChoiceDto<string>[];
}
