package steamcm

import (
	"cs-inv-edit/backend/internal/steam"
)

type Encrypter interface {
	Encrypt([]byte) ([]byte, error)
	Decrypt([]byte) ([]byte, error)
}

func NewEncrypter(key []byte, secret []byte) Encrypter {
	if secret == nil {
		return &symetricEncrypter{Key: key}
	}
	return &symetricEncrypterHMAC{Key: key, Secret: secret}
}

type symetricEncrypter struct {
	Key []byte
}

func (e *symetricEncrypter) Encrypt(data []byte) ([]byte, error) {
	return steam.AESEncrypt(e.Key, data)
}

func (e *symetricEncrypter) Decrypt(data []byte) ([]byte, error) {
	return steam.AESDecrypt(e.Key, data)
}

type symetricEncrypterHMAC struct {
	Key    []byte
	Secret []byte
}

func (e *symetricEncrypterHMAC) Encrypt(data []byte) ([]byte, error) {
	return steam.AESEncryptWithHMAC(e.Key, e.Secret, data)
}

func (e *symetricEncrypterHMAC) Decrypt(data []byte) ([]byte, error) {
	return steam.AESDecryptWithHMAC(e.Key, e.Secret, data)
}
