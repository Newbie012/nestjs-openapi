// The same parent text in both files, over a child that differs
export interface RowDto {
  id: string;
}

export interface SectionDto {
  rows: RowDto[];
}

// Differs from reports/b's ResultDto: only ResultDto<string>, used by both
// files, is a collision
export interface ResultDto<T> {
  data: T;
}

export interface DailyReportDto {
  section: SectionDto;
  summary: ResultDto<string>;
  count: ResultDto<number>;
}
