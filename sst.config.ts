// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- SST generates this file; its template uses this form.
/// <reference path="./.sst/platform/config.d.ts" />

/**
 * The AWS deployment for 1-10 known users. Nothing here is deployed by the assistant:
 * the owner runs `sst deploy --stage production` (see README "Deploying").
 *
 * Needed in the environment at deploy time:
 *   BUDGET_EMAIL   where the monthly cost alarm is sent (production only)
 *   APP_ORIGIN     the site's address, e.g. https://d123.cloudfront.net, once known
 *                  (see "Two-step first deploy" below)
 *   COGNITO_DOMAIN_PREFIX  optional; the sign-in domain prefix, default recipes-<stage>
 * And one SST secret, set once per stage: `npx sst secret set SessionSecret <32+ chars>`
 */
export default $config({
	app(input) {
		const production = input?.stage === 'production';
		return {
			name: 'recipes',
			home: 'aws',
			removal: production ? 'retain' : 'remove',
			protect: production,
			providers: { aws: { region: 'eu-west-1' } }
		};
	},
	async run() {
		const region = 'eu-west-1';
		const production = $app.stage === 'production';

		// Two-step first deploy. The Cognito client must list the site's own callback
		// address, but that address only exists after the site is created, which needs the
		// client's id. So the first deploy uses a placeholder; after it prints the site
		// URL, set APP_ORIGIN to that URL and deploy again.
		const origin = (process.env.APP_ORIGIN ?? 'https://example.invalid').replace(/\/$/, '');

		// Storage: one table for recipes, translations, cached machine translations and user
		// settings (see src/lib/server/aws-store.ts for the key layout), and a private bucket
		// for the original photos.
		const table = new sst.aws.Dynamo('Table', {
			fields: { pk: 'string', sk: 'string', gsi1pk: 'string', gsi1sk: 'string' },
			primaryIndex: { hashKey: 'pk', rangeKey: 'sk' },
			globalIndexes: {
				gsi1: { hashKey: 'gsi1pk', rangeKey: 'gsi1sk', projection: ['data'] }
			}
		});
		const bucket = new sst.aws.Bucket('Images');

		// Sign-in. Accounts are created by the owner in the console; nobody can sign up.
		const users = new sst.aws.CognitoUserPool('Users', {
			usernames: ['email'],
			transform: {
				userPool: (args) => {
					args.adminCreateUserConfig = { allowAdminCreateUserOnly: true };
				}
			}
		});
		const client = users.addClient('Web', {
			callbackUrls: [`${origin}/auth/callback`],
			transform: {
				client: (args) => {
					// Authorization code with PKCE only: no implicit flow, no client secret.
					args.allowedOauthFlows = ['code'];
					args.generateSecret = false;
					args.logoutUrls = [`${origin}/signin`];
				}
			}
		});
		// The hosted sign-in domain: https://<prefix>.auth.<region>.amazoncognito.com
		const prefix = process.env.COGNITO_DOMAIN_PREFIX ?? `recipes-${$app.stage}`;
		new aws.cognito.UserPoolDomain('SignInDomain', {
			domain: prefix,
			userPoolId: users.id
		});

		// Session cookies are signed with this. Set it with `npx sst secret set SessionSecret`.
		const sessionSecret = new sst.Secret('SessionSecret');

		const site = new sst.aws.SvelteKit('Site', {
			link: [table, bucket],
			// Textract reads recipe photos; Translate translates recipe text. Both only take
			// "*" as the resource, so this is the narrowest grant they allow.
			permissions: [
				{ actions: ['textract:DetectDocumentText'], resources: ['*'] },
				// Translate detects each text's language with Comprehend when the source is "auto".
				{ actions: ['translate:TranslateText'], resources: ['*'] },
				{ actions: ['comprehend:DetectDominantLanguage'], resources: ['*'] }
			],
			environment: {
				STORE: 'aws',
				TABLE_NAME: table.name,
				BUCKET_NAME: bucket.name,
				COGNITO_ISSUER: $interpolate`https://cognito-idp.${region}.amazonaws.com/${users.id}`,
				COGNITO_DOMAIN: `https://${prefix}.auth.${region}.amazoncognito.com`,
				COGNITO_CLIENT_ID: client.id,
				SESSION_SECRET: sessionSecret.value
			}
			// To serve the site from your own domain later, add:
			// domain: { name: 'recipes.example.com', dns: sst.aws.dns() }
			// and set APP_ORIGIN to https://recipes.example.com before the next deploy.
		});

		// The cost alarm. An alarm only: it emails at 80% of the budget spent and when the
		// forecast passes 100%. It does not stop spending. Production only, because the
		// budget covers the whole account, not one stage.
		if (production) {
			const email = process.env.BUDGET_EMAIL;
			if (!email) throw new Error('BUDGET_EMAIL must be set to deploy production');
			const monthly = new aws.budgets.Budget('MonthlyCost', {
				name: 'recipes-monthly',
				budgetType: 'COST',
				limitAmount: '10',
				limitUnit: 'USD',
				timeUnit: 'MONTHLY',
				notifications: [
					{
						comparisonOperator: 'GREATER_THAN',
						threshold: 80,
						thresholdType: 'PERCENTAGE',
						notificationType: 'ACTUAL',
						subscriberEmailAddresses: [email]
					},
					{
						comparisonOperator: 'GREATER_THAN',
						threshold: 100,
						thresholdType: 'PERCENTAGE',
						notificationType: 'FORECASTED',
						subscriberEmailAddresses: [email]
					}
				]
			});

			// The hard stop. At 80% of the budget (actual spend), AWS Budgets attaches a
			// deny-everything policy to the app's server role: the site can no longer reach
			// its table, photos, Translate or Textract. Budgets updates spend only a few
			// times a day, so the stop can come hours after the spending.
			const serverRole = site.nodes.server.nodes.role;
			const stopPolicy = new aws.iam.Policy('StopAppPolicy', {
				policy: JSON.stringify({
					Version: '2012-10-17',
					Statement: [{ Effect: 'Deny', Action: '*', Resource: '*' }]
				})
			});
			const accountId = aws.getCallerIdentityOutput().accountId;
			// The role AWS Budgets assumes to attach that policy, and nothing more.
			const actionRole = new aws.iam.Role('BudgetActionRole', {
				assumeRolePolicy: $jsonStringify({
					Version: '2012-10-17',
					Statement: [
						{
							Effect: 'Allow',
							Principal: { Service: 'budgets.amazonaws.com' },
							Action: 'sts:AssumeRole',
							Condition: { StringEquals: { 'aws:SourceAccount': accountId } }
						}
					]
				})
			});
			new aws.iam.RolePolicy('BudgetActionRolePolicy', {
				role: actionRole.name,
				policy: $jsonStringify({
					Version: '2012-10-17',
					Statement: [
						{
							Effect: 'Allow',
							Action: ['iam:AttachRolePolicy', 'iam:DetachRolePolicy'],
							Resource: serverRole.arn
						}
					]
				})
			});
			new aws.budgets.BudgetAction('StopAppAt80Percent', {
				accountId,
				budgetName: monthly.name,
				actionType: 'APPLY_IAM_POLICY',
				approvalModel: 'AUTOMATIC',
				notificationType: 'ACTUAL',
				executionRoleArn: actionRole.arn,
				actionThreshold: { actionThresholdType: 'PERCENTAGE', actionThresholdValue: 80 },
				definition: {
					iamActionDefinition: { policyArn: stopPolicy.arn, roles: [serverRole.name] }
				},
				subscribers: [{ address: email, subscriptionType: 'EMAIL' }]
			});
		}

		return {
			url: site.url,
			userPoolId: users.id,
			tableName: table.name,
			bucketName: bucket.name
		};
	}
});
