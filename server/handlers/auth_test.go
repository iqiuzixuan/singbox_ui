package handlers

import (
	"testing"
	"time"
)

func TestCurrentAuthSettingsRequiresUsernameAndPassword(t *testing.T) {
	t.Setenv("AUTH_USERNAME", "admin")
	t.Setenv("AUTH_PASSWORD", "")

	settings := currentAuthSettings()
	if settings.Enabled {
		t.Fatal("auth should be disabled unless username and password are both set")
	}
}

func TestSessionTokenValidation(t *testing.T) {
	settings := authSettings{
		Enabled:  true,
		Username: "admin",
		Password: "secret",
		Secret:   "signing-secret",
		TTL:      time.Hour,
	}
	now := time.Unix(1000, 0)
	token := createSessionToken(settings, now)

	if !validateSessionToken(settings, token, now.Add(30*time.Minute)) {
		t.Fatal("expected fresh session token to validate")
	}
	if validateSessionToken(settings, token, now.Add(2*time.Hour)) {
		t.Fatal("expected expired session token to be rejected")
	}

	otherSettings := settings
	otherSettings.Secret = "different-secret"
	if validateSessionToken(otherSettings, token, now.Add(30*time.Minute)) {
		t.Fatal("expected token signed with a different secret to be rejected")
	}
}

func TestCredentialsMatch(t *testing.T) {
	settings := authSettings{
		Username: "admin",
		Password: "secret",
	}

	if !credentialsMatch(settings, "admin", "secret") {
		t.Fatal("expected matching credentials")
	}
	if credentialsMatch(settings, "admin", "wrong") {
		t.Fatal("expected wrong password to fail")
	}
	if credentialsMatch(settings, "wrong", "secret") {
		t.Fatal("expected wrong username to fail")
	}
}
