import {parseQrContactVCard} from '../src/entities/qr/vcard';
test('structured vCard3 names/address preserve form data and decode escaped delimiters/newlines',()=>{
 const fields=parseQrContactVCard('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Иван Сергеевич Петров\r\nN:Петров;Иван Сергеевич;;;\r\nADR:;;Москва\\, улица\\; дом 1;;;;\r\nTEL:+79991234567\r\nURL:https://fixture.invalid:443/contact\r\nNOTE:one\\ntwo\\\\path\r\nEND:VCARD\r\n');
 expect(fields).toEqual({firstname:'Иван Сергеевич',lastname:'Петров',contactAddress:'Москва, улица; дом 1',phone:'+79991234567',website:'https://fixture.invalid:443/contact',note:'one\ntwo\\path'});
});
test('legacy FN/flat ADR and folded or parameterized properties remain readable',()=>{
 expect(parseQrContactVCard('BEGIN:VCARD\nFN:Legacy Full Name\nADR:Legacy\\; street\nitem1.EMAIL;TYPE="INTERNET:WORK":alice@fixture.invalid\nNOTE:first part\n second part\nEND:VCARD')).toEqual({firstname:'Legacy Full Name',contactAddress:'Legacy; street',email:'alice@fixture.invalid',note:'first partsecond part'});
});
test('escaped semicolons in structured names do not become field separators',()=>{
 expect(parseQrContactVCard('N:Last\\;part;First\\,part;;;\nFN:Fallback')).toEqual({firstname:'First,part',lastname:'Last;part'});
});
