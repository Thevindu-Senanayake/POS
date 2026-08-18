import { OrderScreen } from '@/features/pos/order-screen';

export default function TableOrderPage({ params }: { params: { tableId: string } }) {
  return <OrderScreen tableId={params.tableId} />;
}
