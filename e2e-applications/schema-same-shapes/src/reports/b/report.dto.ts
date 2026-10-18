export interface RowDto {
  id: string;
  total: number;
}

export interface SectionDto {
  rows: RowDto[];
}

export interface ResultDto<T> {
  data: T;
  error?: string;
}

export interface WeeklyReportDto {
  section: SectionDto;
  summary: ResultDto<string>;
}
