/**
 * Alinhado a Zamba-Mocambique `components/PassengerSideMenu.tsx` (menuItems + cores).
 * Rotas nativas Expo onde diferem das paths web.
 */

import type { ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';

export type DrawerMenuEntry = {
  id: string;
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  /** Cor do ícone (Lucide stroke → Ionicons), igual ao web */
  color: string;
  /** Fundo do quadrado do ícone — mesmo rgba do web */
  bgColor: string;
  /** Path usado em `router.push` no app Expo */
  nativePath: string;
};

/** Mesma ordem e labels que `PassengerSideMenu` no web */
export const DRAWER_MENU_ITEMS: DrawerMenuEntry[] = [
  {
    id: 'profile',
    label: 'Perfil',
    icon: 'person-circle-outline',
    color: '#3B82F6',
    bgColor: 'rgba(59, 130, 246, 0.12)',
    nativePath: '/profile',
  },
  {
    id: 'shared-rides',
    label: 'Viagem Partilhada',
    icon: 'share-social-outline',
    color: '#EC4899',
    bgColor: 'rgba(236, 72, 153, 0.12)',
    nativePath: '/shared-rides',
  },
  {
    id: 'verification',
    label: 'Verificação de conta',
    icon: 'shield-checkmark-outline',
    color: '#10B981',
    bgColor: 'rgba(16, 185, 129, 0.12)',
    nativePath: '/verification',
  },
  {
    id: 'addresses',
    label: 'Endereços guardados',
    icon: 'location-outline',
    color: '#8B5CF6',
    bgColor: 'rgba(139, 92, 246, 0.12)',
    nativePath: '/saved-addresses',
  },
  {
    id: 'history',
    label: 'Histórico de viagem',
    icon: 'time-outline',
    color: '#F59E0B',
    bgColor: 'rgba(245, 158, 11, 0.12)',
    nativePath: '/history',
  },
  {
    id: 'support',
    label: 'Suporte',
    icon: 'help-circle-outline',
    color: '#6366F1',
    bgColor: 'rgba(99, 102, 241, 0.12)',
    nativePath: '/support',
  },
  {
    id: 'about',
    label: 'Sobre',
    icon: 'information-circle-outline',
    color: '#6B7280',
    bgColor: 'rgba(107, 114, 128, 0.12)',
    nativePath: '/about',
  },
];
