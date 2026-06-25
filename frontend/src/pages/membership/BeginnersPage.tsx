import React from 'react';
import MembershipLanding from '../../components/membership/MembershipLanding';
import { beginners } from '../../components/membership/personaContent';

function BeginnersPage() {
  return <MembershipLanding content={beginners} />;
}

export default BeginnersPage;
