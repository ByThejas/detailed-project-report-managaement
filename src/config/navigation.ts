import { Calculator, FlaskConical, FileSpreadsheet, FilePlus2, FolderOpen, LayoutDashboard, type LucideIcon } from 'lucide-react';

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
  // Temporary: test one BOQ workbook on its own, apart from any DPR.
  { label: 'BOQ test bench (temp)', path: '/boq-test', icon: FlaskConical },
];
