export function utf8Size(value:string):number{
  let size=0;for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);if(code<128)size++;else if(code<2048)size+=2;else if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))throw Error('Invalid Unicode');size+=4;}else{if(code>=0xdc00&&code<=0xdfff)throw Error('Invalid Unicode');size+=3;}}return size;
}
