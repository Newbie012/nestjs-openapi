// This file does not match dtoGlob (`src/**/*.dto.ts`).
export type SortByType = {
  field: string;
  direction: 'asc' | 'desc';
};

export abstract class BaseCursorResponse {
  cursor: string;
}

export class CursorResponse extends BaseCursorResponse {
  sortBy: SortByType;
}
