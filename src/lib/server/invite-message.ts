/**
 * Cognito "custom message" trigger: writes the invitation for a new user in the language the
 * admin chose, which is the user's `locale` attribute (en, es, ca or ru). Other messages (password
 * resets, codes) are left as Cognito writes them.
 *
 * Cognito fills in the placeholders: {username} and {####} (the temporary password). The
 * trigger passes them through from the event, so the text never hard-codes them.
 */

interface CustomMessageEvent {
	triggerSource: string;
	request: {
		userAttributes: Record<string, string>;
		usernameParameter?: string;
		codeParameter?: string;
	};
	response: { emailSubject?: string; emailMessage?: string; smsMessage?: string };
}

type Locale = 'en' | 'es' | 'ca' | 'ru';

interface Invitation {
	subject: string;
	/** Body text. {APP} is the site address, {username} and {####} are Cognito's placeholders. */
	body: string;
	sms: string;
}

const INVITATIONS: Record<Locale, Invitation> = {
	en: {
		subject: 'Your table is set: welcome to the recipe book 🥄',
		body: `Hi there, and welcome to the recipe book!

Someone who loves you (and your appetite) has added you to our family recipe book. Time to get your apron on.

1. Go to {APP}/signin
2. Sign in with:
     username: {username}
     temporary password: {####}
3. You will be asked to pick your own password. Choose something you will remember, not something the cat could guess.
4. Install the app on your phone from {APP}/install

Recipes you can cook, shop from and share. No ads, no spam, no sneaky soup.

Happy cooking!`,
		sms: 'Welcome to the recipe book! Username: {username}, temporary password: {####}. Sign in at {APP}/signin'
	},
	es: {
		subject: 'Tu mesa está lista: bienvenido al libro de recetas 🥄',
		body: `¡Hola y bienvenido al libro de recetas!

Alguien que te quiere (y conoce tu apetito) te ha añadido a nuestro libro de recetas familiar. Hora de ponerte el delantal.

1. Entra en {APP}/signin
2. Inicia sesión con:
     usuario: {username}
     contraseña temporal: {####}
3. Te pedirá que elijas tu propia contraseña. Elige una que recuerdes, no una que el gato pueda adivinar.
4. Instala la app en tu móvil desde {APP}/install

Recetas para cocinar, comprar y compartir. Sin anuncios, sin spam, sin sopa a escondidas.

¡Buen provecho!`,
		sms: 'Bienvenido al libro de recetas. Usuario: {username}, contraseña temporal: {####}. Entra en {APP}/signin'
	},
	ca: {
		subject: 'La taula és a punt: benvingut al llibre de receptes 🥄',
		body: `Hola i benvingut al llibre de receptes!

Algú que t'estima (i coneix el teu apetit) t'ha afegit al nostre llibre de receptes familiar. És hora de posar-te el davantal.

1. Entra a {APP}/signin
2. Inicia la sessió amb:
     usuari: {username}
     contrasenya temporal: {####}
3. Et demanarà que triïs la teva pròpia contrasenya. Tria'n una que recordis, no una que el gat pugui endevinar.
4. Instal·la l'aplicació al mòbil des de {APP}/install

Receptes per cuinar, comprar-hi i compartir. Sense anuncis, sense spam, sense sopa d'amagat.

Bon profit!`,
		sms: 'Benvingut al llibre de receptes. Usuari: {username}, contrasenya temporal: {####}. Entra a {APP}/signin'
	},
	ru: {
		subject: 'Стол накрыт: добро пожаловать в книгу рецептов 🥄',
		body: `Привет и добро пожаловать в книгу рецептов!

Кто-то, кто тебя любит (и знает твой аппетит), добавил тебя в нашу семейную книгу рецептов. Пора надевать фартук.

1. Зайди на {APP}/signin
2. Войди, используя:
     имя пользователя: {username}
     временный пароль: {####}
3. Тебя попросят придумать свой пароль. Выбери такой, который запомнишь, а не тот, который угадает кот.
4. Установи приложение на телефон: {APP}/install

Рецепты, по которым можно готовить, делать покупки и делиться. Без рекламы, без спама и без тайного супа.

Приятного аппетита!`,
		sms: 'Добро пожаловать в книгу рецептов! Имя: {username}, временный пароль: {####}. Войти: {APP}/signin'
	}
};

/** The invitation language for a locale value; anything unknown gets English. */
export function invitationLocale(value: string | undefined): Locale {
	const base = (value ?? '').toLowerCase().split(/[-_]/)[0];
	return base === 'es' || base === 'ca' || base === 'ru' ? base : 'en';
}

/** Fills in the site address and Cognito's placeholders. */
export function renderInvitation(
	locale: Locale,
	app: string,
	username = '{username}',
	code = '{####}'
): Invitation {
	const fill = (text: string) =>
		text.replaceAll('{APP}', app).replaceAll('{username}', username).replaceAll('{####}', code);
	const t = INVITATIONS[locale];
	return { subject: t.subject, body: fill(t.body), sms: fill(t.sms) };
}

export function handler(event: CustomMessageEvent): CustomMessageEvent {
	if (event.triggerSource !== 'CustomMessage_AdminCreateUser') return event;
	const app = (process.env.APP_ORIGIN ?? '').replace(/\/$/, '');
	const invitation = renderInvitation(
		invitationLocale(event.request.userAttributes.locale),
		app,
		event.request.usernameParameter,
		event.request.codeParameter
	);
	event.response.emailSubject = invitation.subject;
	event.response.emailMessage = invitation.body;
	event.response.smsMessage = invitation.sms;
	return event;
}
