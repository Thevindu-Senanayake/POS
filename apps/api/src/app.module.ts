import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { IngredientsModule } from './modules/ingredients/ingredients.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module';
import { MenuModule } from './modules/menu/menu.module';
import { ServiceChargeModule } from './modules/service-charge/service-charge.module';
import { OutletModule } from './modules/outlet/outlet.module';
import { RecipesModule } from './modules/recipes/recipes.module';
import { OrdersModule } from './modules/orders/orders.module';
import { TablesModule } from './modules/tables/tables.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { PrintingModule } from './modules/printing/printing.module';
import { ReportsModule } from './modules/reports/reports.module';

/**
 * Composition root. Feature modules are registered here as they are added
 * (auth, ingredients, orders, rooms, printing, reports, realtime, ...).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true, // env is injected by dotenv-cli (dev) or the real environment (prod)
      load: [configuration],
      validate,
    }),
    PrismaModule,
    RealtimeModule,
    HealthModule,
    AuthModule,
    UsersModule,
    IngredientsModule,
    SuppliersModule,
    PurchaseOrdersModule,
    MenuModule,
    ServiceChargeModule,
    OutletModule,
    RecipesModule,
    OrdersModule,
    TablesModule,
    RoomsModule,
    BookingsModule,
    PrintingModule,
    ReportsModule,
  ],
})
export class AppModule {}
