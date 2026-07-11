package econ

import (
	"fmt"
	"strings"
	"unicode/utf8"
)

type kvNode struct {
	value    string
	children kvObject
}

type kvObject map[string]kvNode

func (o kvObject) object(key string) kvObject {
	if node, ok := o[key]; ok {
		return node.children
	}
	return nil
}

func (o kvObject) string(key string) string {
	if node, ok := o[key]; ok {
		return node.value
	}
	return ""
}

func (o kvObject) strings() map[string]string {
	out := make(map[string]string, len(o))
	for key, node := range o {
		if node.value != "" {
			out[key] = node.value
		}
	}
	return out
}

func (n kvNode) objectValue() kvObject {
	return n.children
}

type kvParser struct {
	input string
	pos   int
}

func parseKeyValues(input string) (kvObject, error) {
	parser := &kvParser{input: strings.TrimPrefix(input, "\ufeff")}
	root, err := parser.parseObject(false)
	if err != nil {
		return nil, err
	}
	return root, nil
}

func (p *kvParser) parseObject(requireClose bool) (kvObject, error) {
	out := make(kvObject)
	for {
		p.skipSpaceAndComments()
		if p.eof() {
			if requireClose {
				return nil, fmt.Errorf("unexpected EOF while parsing object")
			}
			return out, nil
		}
		if p.peek() == '}' {
			p.pos++
			return out, nil
		}
		key, err := p.readToken()
		if err != nil {
			return nil, err
		}
		p.skipSpaceAndComments()
		if p.eof() {
			return nil, fmt.Errorf("missing value for key %q", key)
		}
		if p.peek() == '{' {
			p.pos++
			child, err := p.parseObject(true)
			if err != nil {
				return nil, err
			}
			if existing, ok := out[key]; ok && len(existing.children) > 0 {
				out[key] = kvNode{children: mergeObjects(existing.children, child)}
			} else {
				out[key] = kvNode{children: child}
			}
			continue
		}
		value, err := p.readToken()
		if err != nil {
			return nil, err
		}
		out[key] = kvNode{value: value}
	}
}

func mergeObjects(base kvObject, next kvObject) kvObject {
	out := make(kvObject, len(base)+len(next))
	for key, value := range base {
		out[key] = value
	}
	for key, value := range next {
		if existing, ok := out[key]; ok && len(existing.children) > 0 && len(value.children) > 0 {
			out[key] = kvNode{children: mergeObjects(existing.children, value.children)}
			continue
		}
		out[key] = value
	}
	return out
}

func (p *kvParser) skipSpaceAndComments() {
	for !p.eof() {
		r, size := utf8.DecodeRuneInString(p.input[p.pos:])
		if r == '/' && p.pos+1 < len(p.input) && p.input[p.pos+1] == '/' {
			p.pos += 2
			for !p.eof() && p.input[p.pos] != '\n' {
				p.pos++
			}
			continue
		}
		if !isSpace(r) {
			return
		}
		p.pos += size
	}
}

func (p *kvParser) readToken() (string, error) {
	p.skipSpaceAndComments()
	if p.eof() {
		return "", fmt.Errorf("unexpected EOF while reading token")
	}
	if p.peek() == '"' {
		return p.readQuoted()
	}
	start := p.pos
	for !p.eof() {
		r, size := utf8.DecodeRuneInString(p.input[p.pos:])
		if isSpace(r) || r == '{' || r == '}' {
			break
		}
		p.pos += size
	}
	if start == p.pos {
		return "", fmt.Errorf("unexpected character %q at byte %d", p.peek(), p.pos)
	}
	return p.input[start:p.pos], nil
}

func (p *kvParser) readQuoted() (string, error) {
	p.pos++
	var builder strings.Builder
	for !p.eof() {
		ch := p.input[p.pos]
		p.pos++
		if ch == '"' {
			return builder.String(), nil
		}
		if ch == '\\' && !p.eof() {
			next := p.input[p.pos]
			p.pos++
			switch next {
			case 'n':
				builder.WriteByte('\n')
			case 't':
				builder.WriteByte('\t')
			default:
				builder.WriteByte(next)
			}
			continue
		}
		builder.WriteByte(ch)
	}
	return "", fmt.Errorf("unterminated quoted string")
}

func (p *kvParser) eof() bool {
	return p.pos >= len(p.input)
}

func (p *kvParser) peek() byte {
	return p.input[p.pos]
}

func isSpace(r rune) bool {
	return r == ' ' || r == '\t' || r == '\n' || r == '\r'
}
