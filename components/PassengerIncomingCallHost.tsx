import React from 'react';
import { IncomingInternetCallModal } from '@/components/IncomingInternetCallModal';
import { useIncomingCallRing } from '@/hooks/useIncomingCallRing';
import { usePassengerIncomingInternetCall } from '@/hooks/usePassengerIncomingInternetCall';

type Props = {
  userId: string;
};

export function PassengerIncomingCallHost({ userId }: Props) {
  const { incoming, acceptIncoming, rejectIncoming } = usePassengerIncomingInternetCall(userId);
  const ringActive = !!incoming && !incoming.accepting && !incoming.rejecting;

  useIncomingCallRing(ringActive);

  return (
    <IncomingInternetCallModal
      visible={!!incoming}
      incoming={incoming}
      onAccept={acceptIncoming}
      onReject={rejectIncoming}
    />
  );
}
