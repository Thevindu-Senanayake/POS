import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { IngredientDTO, StockMovementDTO } from '@pos/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { IngredientsService } from './ingredients.service';

@Controller('ingredients')
export class IngredientsController {
  constructor(private readonly ingredients: IngredientsService) {}

  // Reads are open to any authenticated user (floor staff need stock visibility).
  @Get()
  list(@Query('includeInactive') includeInactive?: string): Promise<IngredientDTO[]> {
    return this.ingredients.list(includeInactive === 'true');
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<IngredientDTO> {
    return this.ingredients.get(id);
  }

  @Get(':id/movements')
  movements(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ): Promise<StockMovementDTO[]> {
    return this.ingredients.movements(id, limit ? parseInt(limit, 10) : 100);
  }

  // Mutations require the edit_bom permission (admin per spec §7).
  @Post()
  @RequirePermission('edit_bom')
  create(
    @Body() dto: CreateIngredientDto,
    @CurrentUser('userId') userId: string,
  ): Promise<IngredientDTO> {
    return this.ingredients.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermission('edit_bom')
  update(@Param('id') id: string, @Body() dto: UpdateIngredientDto): Promise<IngredientDTO> {
    return this.ingredients.update(id, dto);
  }

  @Post(':id/adjust')
  @RequirePermission('edit_bom')
  adjust(
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
    @CurrentUser('userId') userId: string,
  ): Promise<IngredientDTO> {
    return this.ingredients.adjust(id, dto, userId);
  }
}
