import { IconArrowRight, IconKey, IconLock, IconShieldCheck } from "@tabler/icons-react";
import { Field, Form, Formik } from "formik";
import { useEffect, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import { Button, LocalePicker, Page, ThemeSwitcher } from "src/components";
import { useAuthState } from "src/context";
import { useHealth } from "src/hooks";
import { intl, T } from "src/locale";
import { validateEmail, validateString } from "src/modules/Validations";
import styles from "./index.module.css";

function TwoFactorForm() {
	const codeRef = useRef<HTMLInputElement>(null);
	const [formErr, setFormErr] = useState("");
	const { verifyTwoFactor, cancelTwoFactor } = useAuthState();

	const onSubmit = async (values: { code: string }, { setSubmitting }: any) => {
		setFormErr("");
		try {
			await verifyTwoFactor(values.code);
		} catch (err) {
			if (err instanceof Error) setFormErr(err.message);
		}
		setSubmitting(false);
	};

	useEffect(() => codeRef.current?.focus(), []);

	return (
		<div className={styles.authContent}>
			<IconKey className={styles.formIcon} size={24} />
			<h1>
				<T id="login.2fa-title" />
			</h1>
			<p className={styles.description}>
				<T id="login.2fa-description" />
			</p>
			{formErr && <Alert variant="danger">{formErr}</Alert>}
			<Formik initialValues={{ code: "" }} onSubmit={onSubmit}>
				{({ isSubmitting }) => (
					<Form>
						<Field name="code" validate={validateString(6, 8)}>
							{({ field, form }: any) => (
								<label className="form-label w-100">
									<T id="login.2fa-code" />
									<input
										{...field}
										ref={codeRef}
										type="text"
										inputMode="numeric"
										autoComplete="one-time-code"
										required
										maxLength={8}
										className={`${styles.input} form-control ${form.errors.code && form.touched.code ? "is-invalid" : ""}`}
										placeholder={intl.formatMessage({ id: "login.2fa-code-placeholder" })}
									/>
									<div className="invalid-feedback">{form.errors.code}</div>
								</label>
							)}
						</Field>
						<div className="d-flex gap-2 mt-4">
							<Button type="button" fullWidth onClick={cancelTwoFactor} disabled={isSubmitting}>
								<T id="cancel" />
							</Button>
							<Button type="submit" fullWidth color="azure" isLoading={isSubmitting}>
								<T id="login.2fa-verify" />
							</Button>
						</div>
					</Form>
				)}
			</Formik>
		</div>
	);
}

function PasswordForm() {
	const emailRef = useRef<HTMLInputElement>(null);
	const [formErr, setFormErr] = useState("");
	const { login } = useAuthState();

	useEffect(() => emailRef.current?.focus(), []);

	const onSubmit = async (values: { email: string; password: string }, { setSubmitting }: any) => {
		setFormErr("");
		try {
			await login(values.email, values.password);
		} catch (err) {
			if (err instanceof Error) setFormErr(err.message);
		}
		setSubmitting(false);
	};

	return (
		<div className={styles.passwordPanel}>
			{formErr && <Alert variant="danger">{formErr}</Alert>}
			<Formik initialValues={{ email: "", password: "" }} onSubmit={onSubmit}>
				{({ isSubmitting }) => (
					<Form>
						<Field name="email" validate={validateEmail()}>
							{({ field, form }: any) => (
								<label className="form-label w-100">
									<T id="email-address" />
									<input
										{...field}
										ref={emailRef}
										type="email"
										autoComplete="username"
										required
										className={`${styles.input} form-control ${form.errors.email && form.touched.email ? "is-invalid" : ""}`}
									/>
									<div className="invalid-feedback">{form.errors.email}</div>
								</label>
							)}
						</Field>
						<Field name="password" validate={validateString(8, 255)}>
							{({ field, form }: any) => (
								<label className="form-label w-100 mt-2">
									<T id="password" />
									<input
										{...field}
										type="password"
										autoComplete="current-password"
										required
										maxLength={255}
										className={`${styles.input} form-control ${form.errors.password && form.touched.password ? "is-invalid" : ""}`}
									/>
									<div className="invalid-feedback">{form.errors.password}</div>
								</label>
							)}
						</Field>
						<Button type="submit" fullWidth color="azure" isLoading={isSubmitting} className="mt-3">
							<T id="sign-in" />
						</Button>
					</Form>
				)}
			</Formik>
		</div>
	);
}

function LoginForm() {
	const health = useHealth();
	const [showPassword, setShowPassword] = useState(!health.data?.oidc);
	const providerName = health.data?.oidcName || "NaCl Auth";

	useEffect(() => {
		if (!health.data?.oidc && health.data?.password) setShowPassword(true);
	}, [health.data?.oidc, health.data?.password]);

	return (
		<div className={styles.authContent}>
			<h1>
				<T id="login.title" />
			</h1>
			<p className={styles.description}>
				<T id="login.modern-description" />
			</p>

			{health.data?.oidc && (
				<button
					className={styles.oidcButton}
					type="button"
					onClick={() => {
						window.location.href = "/api/oidc";
					}}
				>
					<IconShieldCheck size={20} />
					<span>{providerName}</span>
					<IconArrowRight className={styles.oidcArrow} size={19} />
				</button>
			)}

			{health.data?.password && (
				<>
					{health.data.oidc && (
						<button
							className={styles.localToggle}
							type="button"
							aria-expanded={showPassword}
							onClick={() => setShowPassword((value) => !value)}
						>
							<IconLock size={17} />
							<T id={showPassword ? "login.hide-local" : "login.use-local"} />
						</button>
					)}
					{showPassword && <PasswordForm />}
				</>
			)}
		</div>
	);
}

export default function Login() {
	const { twoFactorChallenge } = useAuthState();

	return (
		<Page className={styles.page}>
			<header className={styles.topbar}>
				<img src="/images/nacl-logo-text-horizontal.png" alt="Network And Cloud Laboratory" />
				<div className="d-flex align-items-center gap-1">
					<LocalePicker />
					<ThemeSwitcher />
				</div>
			</header>
			<main className={styles.shell}>
				<section className={styles.authCard}>{twoFactorChallenge ? <TwoFactorForm /> : <LoginForm />}</section>
			</main>
			<footer className={styles.footer}>
				<T id="login.footer" />
			</footer>
		</Page>
	);
}
