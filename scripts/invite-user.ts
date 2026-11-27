/**
 * Invites a new user to the recipe book in the language you pick. Cognito emails them a temporary
 * password; the email is written by the custom message trigger (src/lib/server/invite-message.ts)
 * from the user's `locale` attribute.
 *
 *   npx sst shell --stage production -- tsx scripts/invite-user.ts <email> [en|es|ca|ru]
 *
 * The language defaults to en. Run through `sst shell`, so Resource.Users is set.
 */
import {
	AdminCreateUserCommand,
	CognitoIdentityProviderClient
} from '@aws-sdk/client-cognito-identity-provider';
import { Resource } from 'sst';

const [email, language = 'en'] = process.argv.slice(2);
if (!email) throw new Error('Usage: tsx scripts/invite-user.ts <email> [en|es|ca|ru]');
if (!['en', 'es', 'ca', 'ru'].includes(language)) {
	throw new Error(`Language must be en, es, ca or ru, not "${language}"`);
}

const cognito = new CognitoIdentityProviderClient({ region: 'eu-west-1' });
await cognito.send(
	new AdminCreateUserCommand({
		UserPoolId: Resource.Users.id,
		Username: email,
		UserAttributes: [
			{ Name: 'email', Value: email },
			{ Name: 'email_verified', Value: 'true' },
			{ Name: 'locale', Value: language }
		],
		DesiredDeliveryMediums: ['EMAIL']
	})
);
console.log(`Invited ${email} (${language}).`);
