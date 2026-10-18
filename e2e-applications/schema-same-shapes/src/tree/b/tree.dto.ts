export interface BranchDto {
  leaves: LeafDto[];
}

export interface LeafDto {
  branch?: BranchDto;
}

export interface GroveDto {
  root: BranchDto;
}
