import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@pos/db';
import type { RecipeDTO } from '@pos/shared';
import { decToNum } from '../../common/decimal';
import { PrismaService } from '../../prisma/prisma.service';
import { RecipeLineInput } from './dto/set-recipe.dto';

const RECIPE_INCLUDE = {
  ingredient: { select: { name: true } },
} satisfies Prisma.RecipeInclude;

type RecipeWithIngredient = Prisma.RecipeGetPayload<{
  include: typeof RECIPE_INCLUDE;
}>;

@Injectable()
export class RecipesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(menuItemId: string): Promise<RecipeDTO[]> {
    await this.assertMenuItem(menuItemId);
    const recipes = await this.prisma.recipe.findMany({
      where: { menuItemId },
      include: RECIPE_INCLUDE,
      orderBy: { id: 'asc' },
    });
    return recipes.map((r) => this.toDTO(r));
  }

  /** Replace the whole BOM in one transaction (empty list clears it). */
  async replace(
    menuItemId: string,
    items: RecipeLineInput[],
  ): Promise<RecipeDTO[]> {
    await this.assertMenuItem(menuItemId);
    this.assertNoDuplicateIngredients(items);
    if (items.length > 0) {
      await this.assertIngredientsExist(items.map((i) => i.ingredientId));
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.recipe.deleteMany({ where: { menuItemId } });
      if (items.length > 0) {
        await tx.recipe.createMany({
          data: items.map((i) => ({
            menuItemId,
            ingredientId: i.ingredientId,
            quantity: new Prisma.Decimal(i.quantity),
            notes: i.notes ?? null,
          })),
        });
      }
    });
    return this.list(menuItemId);
  }

  async removeLine(menuItemId: string, ingredientId: string): Promise<void> {
    await this.assertMenuItem(menuItemId);
    const res = await this.prisma.recipe.deleteMany({
      where: { menuItemId, ingredientId },
    });
    if (res.count === 0) {
      throw new NotFoundException('Recipe line not found');
    }
  }

  private async assertMenuItem(id: string): Promise<void> {
    const item = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException('Menu item not found');
    }
  }

  private async assertIngredientsExist(ids: string[]): Promise<void> {
    const unique = [...new Set(ids)];
    const count = await this.prisma.ingredient.count({
      where: { id: { in: unique } },
    });
    if (count !== unique.length) {
      throw new BadRequestException('One or more ingredients do not exist');
    }
  }

  private assertNoDuplicateIngredients(items: RecipeLineInput[]): void {
    const ids = items.map((i) => i.ingredientId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Duplicate ingredient in recipe');
    }
  }

  private toDTO(recipe: RecipeWithIngredient): RecipeDTO {
    return {
      id: recipe.id,
      menuItemId: recipe.menuItemId,
      ingredientId: recipe.ingredientId,
      ingredientName: recipe.ingredient?.name,
      quantity: decToNum(recipe.quantity),
      notes: recipe.notes,
    };
  }
}
