import { UserRound, ShieldCheck, Wrench, HardHat, Search, Users, Briefcase, Phone } from 'lucide-react'

// Role icons shared by the plan Overview and the Roles & Responsibilities tab (keys stored with each role)
export const ROLE_ICONS = {
  duty: { icon: UserRound, label: 'Duty holder' },
  coordinator: { icon: ShieldCheck, label: 'Responsible person' },
  facilities: { icon: Wrench, label: 'Facilities' },
  contractors: { icon: HardHat, label: 'Contractor' },
  inspector: { icon: Search, label: 'Surveyor / inspector' },
  staff: { icon: Users, label: 'Staff / occupants' },
  briefcase: { icon: Briefcase, label: 'Other role' },
  phone: { icon: Phone, label: 'Contact point' },
}
