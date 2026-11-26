/**
 * Creates or deletes the end-to-end test user in the e2e stage's Cognito user pool. Run through
 * `sst shell --stage e2e` (scripts/e2e-deployed.ts does this), so Resource.Users is set.
 *
 *   tsx scripts/e2e-user.ts create   reads E2E_EMAIL and E2E_PASSWORD, sets a permanent password
 *   tsx scripts/e2e-user.ts delete   reads E2E_EMAIL
 */
import {
	AdminCreateUserCommand,
	AdminDeleteUserCommand,
	AdminSetUserPasswordCommand,
	CognitoIdentityProviderClient
} from '@aws-sdk/client-cognito-identity-provider';
import { Resource } from 'sst';

const action = process.argv[2];
const email = process.env.E2E_EMAIL;
if (!email) throw new Error('E2E_EMAIL must be set');

const cognito = new CognitoIdentityProviderClient({ region: 'eu-west-1' });
const UserPoolId = Resource.Users.id;

if (action === 'create') {
	const password = process.env.E2E_PASSWORD;
	if (!password) throw new Error('E2E_PASSWORD must be set');
	await cognito.send(
		new AdminCreateUserCommand({
			UserPoolId,
			Username: email,
			MessageAction: 'SUPPRESS',
			UserAttributes: [
				{ Name: 'email', Value: email },
				{ Name: 'email_verified', Value: 'true' }
			]
		})
	);
	// A permanent password, so the first sign-in asks for no new password.
	await cognito.send(
		new AdminSetUserPasswordCommand({
			UserPoolId,
			Username: email,
			Password: password,
			Permanent: true
		})
	);
	console.log('e2e test user created');
} else if (action === 'delete') {
	await cognito.send(new AdminDeleteUserCommand({ UserPoolId, Username: email }));
	console.log('e2e test user deleted');
} else {
	throw new Error('Usage: tsx scripts/e2e-user.ts create|delete');
}
