import { OrderScreen } from '@/features/pos/order-screen';

export default function StandaloneOrderPage({ params }: { params: { orderId: string } }) {
  return <OrderScreen orderId={params.orderId} />;
}
