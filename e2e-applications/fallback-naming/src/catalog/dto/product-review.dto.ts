import { ApiProperty } from '@nestjs/swagger';

interface WeightedScoreDto {
  score: number;
}

class ReviewerDto {
  @ApiProperty()
  name: string;
}

class RatingInProductReviewDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: () => [ReviewerDto] })
  reviewers: ReviewerDto[];
}

class VariantInProductReviewDto {
  @ApiProperty({ type: () => RatingInProductReviewDto })
  rating: RatingInProductReviewDto;

  // An interface is not a value, but `type: () => I` compiles when I is only a type
  @ApiProperty({ type: () => Object })
  weighted: WeightedScoreDto;
}

export class ProductReviewDto {
  @ApiProperty({ type: () => [VariantInProductReviewDto] })
  variants: VariantInProductReviewDto[];

  @ApiProperty({ type: () => [ReviewerDto] })
  reviewers: ReviewerDto[];
}
