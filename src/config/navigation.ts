import { Calculator, FileSpreadsheet, FilePlus2, FolderOpen, LayoutDashboard, type LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export const navigation: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'DPR Initialization', path: '/initialization', icon: FilePlus2 },
  { label: 'DPR Reports', path: '/reports', icon: FileSpreadsheet },
  { label: 'Documents', path: '/documents', icon: FolderOpen },
  { label: 'DPR Preparation', path: '/preparation', icon: Calculator },
];
