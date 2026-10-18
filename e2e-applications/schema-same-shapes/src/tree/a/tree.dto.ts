// Identical recursive types in two files
export interface BranchDto {
  leaves: LeafDto[];
}

export interface LeafDto {
  branch?: BranchDto;
}

export interface ForestDto {
  root: BranchDto;
}
