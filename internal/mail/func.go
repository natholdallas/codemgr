package mail

import (
	"bytes"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
)

// verificationSubject is the fixed subject of every sign-in/registration code
// mail, so a recipient can filter on it.
const verificationSubject = "Codemgr Vault verification code"

// VerificationCodeTPL builds a verification-code message for the given name,
// email and code.
func VerificationCodeTPL(name, email, code string) *Message {
	var body bytes.Buffer
	if err := verficationCodeTpl.Execute(&body, map[string]string{"Name": name, "Code": code}); err != nil {
		// The template is static and only fails on an unparsable field, which
		// cannot happen with two strings; send no mail rather than a broken one.
		return nil
	}
	m := NewMessage([]string{email}, verificationSubject)
	m.SetBodyHTML(body.String())
	return m
}

// Deliver dials SMTP, sends one message and closes the session.
func Deliver(m *Message) error {
	cl, err := NewClient()
	if err != nil {
		return err
	}
	defer cl.Close()
	return cl.Send(m)
}

// SendVerificationCode emails the verification-code template.
func SendVerificationCode(name, email, code string) error {
	m := VerificationCodeTPL(name, email, code)
	if m == nil {
		return errors.New("mail: verification template failed")
	}
	return Deliver(m)
}

// SendNotice emails a plain-text notice (e.g. "an account already exists").
func SendNotice(to []string, subject, text string) error {
	return SendMail(to, subject, func(m *Message) {
		m.SetBodyText(text)
	})
}

// GenerateVerificationCode returns a cryptographically random 6-digit code.
func GenerateVerificationCode() string {
	n, err := rand.Int(rand.Reader, big.NewInt(900000))
	if err != nil {
		return "000000"
	}
	return fmt.Sprintf("%06d", n.Int64()+100000)
}
