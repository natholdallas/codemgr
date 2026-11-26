package mail

import (
	"crypto/tls"
	"errors"
	"net"
	"net/smtp"

	"codemgr/internal/conf"
)

// Client is a reusable SMTP client. It holds a single persistent connection so
// multiple messages can be sent without re-establishing the session each time.
type Client struct {
	c    *smtp.Client
	from string
}

// NewClient dials the configured SMTP server, applies the transport security and
// authenticates when a username is configured.
//
// `smtp.security` selects the transport: `ssl` (implicit TLS, typical for 465),
// `starttls` (require the STARTTLS upgrade), `none` (plaintext, e.g. a trusted
// local relay). An empty value auto-detects: port 465 uses implicit TLS,
// otherwise STARTTLS is used when the server advertises it.
//
// Authentication is skipped when no username is set, so relays that accept
// unauthenticated mail from a trusted host also work.
func NewClient() (*Client, error) {
	host, _, err := net.SplitHostPort(conf.App.SMTPAddr)
	if err != nil {
		return nil, err
	}
	tlsCfg := &tls.Config{ServerName: host}

	var c *smtp.Client
	switch conf.App.SMTPSecurity {
	case "ssl", "tls", "implicit":
		c, err = dialTLS(conf.App.SMTPAddr, host, tlsCfg)
	case "starttls", "start-tls":
		c, err = dialPlain(conf.App.SMTPAddr, tlsCfg, true)
	case "none", "plain", "plaintext", "insecure":
		c, err = smtp.Dial(conf.App.SMTPAddr)
	case "", "auto": // auto
		if conf.App.SMTPPort == 465 {
			c, err = dialTLS(conf.App.SMTPAddr, host, tlsCfg)
		} else {
			c, err = dialPlain(conf.App.SMTPAddr, tlsCfg, false)
		}
	default:
		return nil, errors.New("mail: unknown smtp.security " + conf.App.SMTPSecurity)
	}
	if err != nil {
		return nil, err
	}

	if conf.App.SMTPUsername != "" {
		auth := smtp.PlainAuth("", conf.App.SMTPUsername, conf.App.SMTPPassword, host)
		if err := c.Auth(auth); err != nil {
			c.Close()
			return nil, err
		}
	}
	return &Client{c: c, from: conf.App.SMTPFrom}, nil
}

// dialTLS opens an implicit-TLS connection (SMTPS).
func dialTLS(addr, host string, tlsCfg *tls.Config) (*smtp.Client, error) {
	conn, err := tls.Dial("tcp", addr, tlsCfg)
	if err != nil {
		return nil, err
	}
	c, err := smtp.NewClient(conn, host)
	if err != nil {
		conn.Close()
		return nil, err
	}
	return c, nil
}

// dialPlain dials without TLS and upgrades with STARTTLS when the server offers
// it. When require is true a missing STARTTLS extension is an error.
func dialPlain(addr string, tlsCfg *tls.Config, require bool) (*smtp.Client, error) {
	c, err := smtp.Dial(addr)
	if err != nil {
		return nil, err
	}
	ok, _ := c.Extension("STARTTLS")
	if require && !ok {
		c.Close()
		return nil, errors.New("mail: smtp.security is starttls but the server does not advertise STARTTLS")
	}
	if ok {
		if err := c.StartTLS(tlsCfg); err != nil {
			c.Close()
			return nil, err
		}
	}
	return c, nil
}

// Send delivers a single message over the persistent connection.
func (cl *Client) Send(m *Message) error {
	if err := cl.c.Mail(cl.from); err != nil {
		return err
	}
	for _, recp := range m.Recipients() {
		if err := cl.c.Rcpt(recp); err != nil {
			return err
		}
	}
	w, err := cl.c.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write(m.Bytes()); err != nil {
		return err
	}
	return w.Close()
}

// Close terminates the SMTP session and closes the connection.
func (cl *Client) Close() error {
	return cl.c.Quit()
}
