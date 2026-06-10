package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const authCookieName = "singbox_ui_session"

type authSettings struct {
	Enabled  bool
	Username string
	Password string
	Secret   string
	TTL      time.Duration
}

func currentAuthSettings() authSettings {
	username := strings.TrimSpace(os.Getenv("AUTH_USERNAME"))
	password := os.Getenv("AUTH_PASSWORD")
	enabled := username != "" && password != ""
	secret := os.Getenv("AUTH_SECRET")
	if secret == "" {
		secret = password
	}

	ttl := 24 * time.Hour
	if rawTTL := strings.TrimSpace(os.Getenv("AUTH_SESSION_TTL")); rawTTL != "" {
		if parsed, err := time.ParseDuration(rawTTL); err == nil && parsed > 0 {
			ttl = parsed
		}
	}

	return authSettings{
		Enabled:  enabled,
		Username: username,
		Password: password,
		Secret:   secret,
		TTL:      ttl,
	}
}

func credentialsMatch(settings authSettings, username string, password string) bool {
	userOK := subtle.ConstantTimeCompare([]byte(username), []byte(settings.Username)) == 1
	passOK := subtle.ConstantTimeCompare([]byte(password), []byte(settings.Password)) == 1
	return userOK && passOK
}

func createSessionToken(settings authSettings, now time.Time) string {
	expiresAt := now.Add(settings.TTL).Unix()
	payload := fmt.Sprintf("%s|%d", settings.Username, expiresAt)
	mac := hmac.New(sha256.New, []byte(settings.Secret))
	mac.Write([]byte(payload))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return base64.RawURLEncoding.EncodeToString([]byte(payload + "|" + signature))
}

func validateSessionToken(settings authSettings, token string, now time.Time) bool {
	decoded, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return false
	}

	parts := strings.Split(string(decoded), "|")
	if len(parts) != 3 {
		return false
	}

	username := parts[0]
	expiresAt, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || now.Unix() > expiresAt {
		return false
	}
	if subtle.ConstantTimeCompare([]byte(username), []byte(settings.Username)) != 1 {
		return false
	}

	payload := username + "|" + parts[1]
	mac := hmac.New(sha256.New, []byte(settings.Secret))
	mac.Write([]byte(payload))
	expectedSignature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(parts[2]), []byte(expectedSignature))
}

func isHTTPSRequest(c *gin.Context) bool {
	if c.Request.TLS != nil {
		return true
	}
	return strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https")
}

func setSessionCookie(c *gin.Context, token string, ttl time.Duration) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     authCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(ttl.Seconds()),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isHTTPSRequest(c),
	})
}

func clearSessionCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     authCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isHTTPSRequest(c),
	})
}

func isRequestAuthenticated(c *gin.Context, settings authSettings) bool {
	if !settings.Enabled {
		return true
	}

	if username, password, ok := c.Request.BasicAuth(); ok && credentialsMatch(settings, username, password) {
		return true
	}

	cookie, err := c.Request.Cookie(authCookieName)
	if err != nil {
		return false
	}
	return validateSessionToken(settings, cookie.Value, time.Now())
}

// AuthMiddleware protects API routes when AUTH_USERNAME and AUTH_PASSWORD are configured.
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		settings := currentAuthSettings()
		if !settings.Enabled || c.Request.Method == http.MethodOptions {
			c.Next()
			return
		}

		if isRequestAuthenticated(c, settings) {
			c.Next()
			return
		}

		c.AbortWithStatusJSON(http.StatusUnauthorized, ErrorResponse{
			Error:   "Unauthorized",
			Message: "Authentication required",
		})
	}
}

// AuthStatus reports whether authentication is enabled and whether the request is signed in.
func AuthStatus(c *gin.Context) {
	settings := currentAuthSettings()
	authenticated := !settings.Enabled || isRequestAuthenticated(c, settings)
	response := gin.H{
		"enabled":       settings.Enabled,
		"authenticated": authenticated,
	}
	if authenticated {
		response["username"] = settings.Username
	}
	c.JSON(http.StatusOK, response)
}

// Login verifies account credentials and starts a cookie-backed session.
func Login(c *gin.Context) {
	settings := currentAuthSettings()
	if !settings.Enabled {
		c.JSON(http.StatusOK, gin.H{
			"enabled":       false,
			"authenticated": true,
		})
		return
	}

	var request struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error:   "Invalid request",
			Message: err.Error(),
		})
		return
	}

	if !credentialsMatch(settings, request.Username, request.Password) {
		c.JSON(http.StatusUnauthorized, ErrorResponse{
			Error:   "Unauthorized",
			Message: "Invalid username or password",
		})
		return
	}

	setSessionCookie(c, createSessionToken(settings, time.Now()), settings.TTL)
	c.JSON(http.StatusOK, gin.H{
		"enabled":       true,
		"authenticated": true,
		"username":      settings.Username,
	})
}

// Logout clears the session cookie.
func Logout(c *gin.Context) {
	clearSessionCookie(c)
	c.JSON(http.StatusOK, gin.H{
		"authenticated": false,
	})
}
