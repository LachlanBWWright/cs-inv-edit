package steam

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha1"
	"crypto/x509"
	"errors"
)

func EncryptOAEPSha1(key []byte, data []byte) ([]byte, error) {
	parsedKey, err := x509.ParsePKIXPublicKey(key)
	if err != nil {
		return nil, err
	}
	pubKey, ok := parsedKey.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("public key is not an rsa key")
	}

	return rsa.EncryptOAEP(
		sha1.New(),
		rand.Reader,
		pubKey,
		data,
		nil,
	)
}

func AESEncrypt(key []byte, data []byte) ([]byte, error) {
	iv := make([]byte, 16)
	if _, err := rand.Reader.Read(iv); err != nil {
		return nil, err
	}
	return symetricEncryptWithIV(data, key, iv)
}

func AESDecrypt(key []byte, data []byte) ([]byte, error) {
	// TODO: Check len of data is enough
	iv, err := symetricDecryptIV(data[:16], key)
	if err != nil {
		return nil, err
	}
	return symetricDecryptWithIV(data[16:], key, iv)
}

func AESEncryptWithHMAC(key []byte, secret []byte, data []byte) ([]byte, error) {
	prefix := make([]byte, 3)
	if _, err := rand.Reader.Read(prefix); err != nil {
		return nil, err
	}
	iv, err := generateHmacIV(data, secret, prefix)
	if err != nil {
		return nil, err
	}
	return symetricEncryptWithIV(data, key, iv)
}

func AESDecryptWithHMAC(key []byte, secret []byte, data []byte) ([]byte, error) {
	iv, err := symetricDecryptIV(data[:16], key)
	if err != nil {
		return nil, err
	}
	output, err := symetricDecryptWithIV(data[16:], key, iv)
	if err != nil {
		return nil, err
	}
	checkIv, err := generateHmacIV(output, secret, iv[len(iv)-3:])
	if err != nil {
		return nil, err
	}
	if !hmac.Equal(iv, checkIv) {
		return nil, errors.New("hmac does not match")
	}
	return output, nil
}

func addPKCS7Padding(input []byte, blockSize int) []byte {
	pad := blockSize - len(input)%blockSize
	padText := bytes.Repeat([]byte{byte(pad)}, pad)
	return append(input, padText...)
}

func trimPKCS7Padding(input []byte) []byte {
	pad := int(input[len(input)-1])
	return input[:len(input)-pad]
}

func generateHmacIV(data []byte, secret []byte, prefix []byte) ([]byte, error) {
	h := hmac.New(sha1.New, secret)
	if _, err := h.Write(prefix); err != nil {
		return nil, err
	}
	if _, err := h.Write(data); err != nil {
		return nil, err
	}
	return append(h.Sum(nil)[:13], prefix...), nil
}

func symetricDecryptIV(data []byte, key []byte) ([]byte, error) {
	c, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	iv := make([]byte, 16)
	c.Decrypt(iv, data)
	return iv, nil
}

func symetricEncryptWithIV(data []byte, key []byte, iv []byte) ([]byte, error) {
	c, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	cryptedIv := make([]byte, 16)
	c.Encrypt(cryptedIv, iv)

	encrypter := cipher.NewCBCEncrypter(c, iv)
	input := addPKCS7Padding(data, encrypter.BlockSize())
	cryptedInput := make([]byte, len(input))
	encrypter.CryptBlocks(cryptedInput, input)

	result := make([]byte, 0)
	result = append(result, cryptedIv...)
	result = append(result, cryptedInput...)
	return result, nil
}

func symetricDecryptWithIV(data []byte, key []byte, iv []byte) ([]byte, error) {
	c, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	result := make([]byte, len(data))
	decrypter := cipher.NewCBCDecrypter(c, iv)
	decrypter.CryptBlocks(result, data)
	return trimPKCS7Padding(result), nil
}
