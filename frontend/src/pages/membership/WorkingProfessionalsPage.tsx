import React from 'react';
import MembershipLanding from '../../components/membership/MembershipLanding';
import { workingProfessionals } from '../../components/membership/personaContent';

function WorkingProfessionalsPage() {
  return <MembershipLanding content={workingProfessionals} />;
}

export default WorkingProfessionalsPage;
