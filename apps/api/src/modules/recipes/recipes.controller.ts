import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
} from '@nestjs/common';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { SetRecipeDto } from './dto/set-recipe.dto';
import { RecipesService } from './recipes.service';

/**
 * Bill of materials for a menu item (spec §4). Cost-sensitive, so the whole
 * controller requires `edit_bom` (admin-only per spec §7). The order flow reads
 * recipes server-side to deduct stock; it does not go through this controller.
 */
@Controller('menu-items/:menuItemId/recipe')
@RequirePermission('edit_bom')
export class RecipesController {
  constructor(private readonly recipes: RecipesService) {}

  @Get()
  list(@Param('menuItemId') menuItemId: string) {
    return this.recipes.list(menuItemId);
  }

  @Put()
  replace(@Param('menuItemId') menuItemId: string, @Body() dto: SetRecipeDto) {
    return this.recipes.replace(menuItemId, dto.items);
  }

  @Delete(':ingredientId')
  @HttpCode(204)
  async remove(
    @Param('menuItemId') menuItemId: string,
    @Param('ingredientId') ingredientId: string,
  ) {
    await this.recipes.removeLine(menuItemId, ingredientId);
  }
}
