import { CursorResponse, SortByType } from './cursor.dto.util';

// Matches dtoGlob, but its field and base types live outside it.
export class ListRequestDto {
  sortBy: SortByType;
}

export class ExtendedCursorDto extends CursorResponse {
  extra: string;
}
