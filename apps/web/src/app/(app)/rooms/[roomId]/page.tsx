import { RoomDetail } from '@/features/rooms/room-detail';

export default function RoomDetailPage({ params }: { params: { roomId: string } }) {
  return <RoomDetail roomId={params.roomId} />;
}
