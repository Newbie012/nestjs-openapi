import { Controller, Get, Module } from '@nestjs/common';
import { InvoiceDto } from './billing/billing.dto';
import { RefundDto } from './refunds/refund.dto';
import { TagFiltersDto } from './catalog/tag.dto';
import { ForestDto } from './tree/a/tree.dto';
import { GroveDto } from './tree/b/tree.dto';
import { DailyReportDto } from './reports/a/report.dto';
import { WeeklyReportDto } from './reports/b/report.dto';
import { TaskDto } from './notes/a/note.dto';
import { CommentDto } from './notes/b/note.dto';
import { ItemListDto } from './inventory/item.dto';
import { ShelfDto } from './inventory/shelf.dto';

// /same/* reaches only same-name declarations with equal schemas;
// /differ/* reaches ones that differ
@Controller()
export class AppController {
  @Get('same/invoices')
  invoice(): InvoiceDto {
    return null as never;
  }

  @Get('same/refunds')
  refund(): RefundDto {
    return null as never;
  }

  @Get('same/tags')
  tags(): TagFiltersDto {
    return null as never;
  }

  @Get('same/forests')
  forest(): ForestDto {
    return null as never;
  }

  @Get('same/groves')
  grove(): GroveDto {
    return null as never;
  }

  @Get('differ/daily')
  daily(): DailyReportDto {
    return null as never;
  }

  @Get('differ/weekly')
  weekly(): WeeklyReportDto {
    return null as never;
  }

  @Get('differ/tasks')
  task(): TaskDto {
    return null as never;
  }

  @Get('differ/comments')
  comment(): CommentDto {
    return null as never;
  }

  @Get('differ/items')
  items(): ItemListDto {
    return null as never;
  }

  @Get('differ/shelves')
  shelf(): ShelfDto {
    return null as never;
  }
}

@Module({ controllers: [AppController] })
export class AppModule {}
