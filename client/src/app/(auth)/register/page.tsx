import { redirect } from 'next/navigation';

/**
 * Registration lives on the login page as a tab so both forms share one
 * component and one set of validation rules. This route exists only so older
 * links and bookmarks resolve instead of 404ing.
 */
export default function RegisterRedirectPage() {
  redirect('/login?tab=register');
}
