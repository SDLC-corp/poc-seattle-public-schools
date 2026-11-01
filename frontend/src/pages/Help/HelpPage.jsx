import { LifeBuoy } from 'lucide-react'
import HelpLearning from './HelpLearning'
import '../Compliance/compliance.css'

export default function HelpPage() {
  return (
    <div className="help-page">
      <div className="c-head">
        <div>
          <h1><LifeBuoy size={22} />Help &amp; Learning</h1>
          <p>Software training, user guides and answers to common questions.</p>
        </div>
      </div>
      <HelpLearning />
    </div>
  )
}
