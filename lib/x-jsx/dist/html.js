import { untrack, createRenderEffect, flatten, merge } from '@solidjs/signals';

// Based on package html-parse-stringify2
// Expanded to handle webcomponents

const tagRE = /(?:<!--[\S\s]*?-->|<(?:"[^"]*"['"]*|'[^']*'['"]*|[^'">])+>)/g;

// See https://regexr.com/6p8p0
const attrRE = /(?:\s(?<boolean>[^/\s><=]+?)(?=[\s/>]))|(?:(?<name>\S+?)(?:\s*=\s*(?:(['"])(?<quotedValue>[\s\S]*?)\3|(?<unquotedValue>[^\s>]+))))/g;
//                   ^ capture group 1: boolean attribute name (attributes without values)
//                                                         ^ capture group 2: non-boolean attribute name
//                                                                                         ^ capture group 4: non-boolean attribute value with quotes
//                                                                                                                    ^ capture group 5: non-boolean attribute value without quotes
// TODO
//  - "/" values in the middle of the HTML tag (they don't self-close the element, but skipped)
//  - What other cases?

const lookup = {
  area: true,
  base: true,
  br: true,
  col: true,
  embed: true,
  hr: true,
  img: true,
  input: true,
  keygen: true,
  link: true,
  menuitem: true,
  meta: true,
  param: true,
  source: true,
  track: true,
  wbr: true
};
function parseTag(/**@type {string}*/tag) {
  const res = {
    type: 'tag',
    name: '',
    voidElement: false,
    attrs: [],
    children: []
  };
  const tagMatch = tag.match(/<\/?([^\s]+?)[/\s>]/);
  if (tagMatch) {
    res.name = tagMatch[1];
    if (lookup[tagMatch[1].toLowerCase()] || tag.charAt(tag.length - 2) === '/') {
      res.voidElement = true;
    }

    // handle comment tag
    if (res.name.startsWith('!--')) {
      const endIndex = tag.indexOf('-->');
      return {
        type: 'comment',
        comment: endIndex !== -1 ? tag.slice(4, endIndex) : ''
      };
    }
  }
  const reg = new RegExp(attrRE);
  for (const match of tag.matchAll(reg)) {
    // TODO named groups method not working yet, groups is undefined in tests (maybe not out in Node.js yet)
    // const groups = match.groups
    // res.attrs[groups.boolean || groups.name] = groups.value1 || groups.value2 || ""
    if ((match[1] || match[2]).startsWith('use:')) {
      res.attrs.push({
        type: 'directive',
        name: match[1] || match[2],
        value: match[4] || match[5] || ''
      });
    } else {
      res.attrs.push({
        type: 'attr',
        name: match[1] || match[2],
        value: match[4] || match[5] || ''
      });
    }
  }
  return res;
}
// common logic for pushing a child node onto a list
function pushTextNode(list, html, start) {
  // calculate correct end of the content slice in case there's
  // no tag after the text node.
  const end = html.indexOf('<', start);
  const content = html.slice(start, end === -1 ? void 0 : end);
  if (!/^\s*$/.test(content)) {
    list.push({
      type: 'text',
      content: content
    });
  }
}
function pushCommentNode(list, tag) {
  // calculate correct end of the content slice in case there's
  // no tag after the text node.
  const content = tag.replace('<!--', '').replace('-->', '');
  if (!/^\s*$/.test(content)) {
    list.push({
      type: 'comment',
      content: content
    });
  }
}
function parse(html) {
  const result = [];
  let current = void 0;
  let level = -1;
  const arr = [];
  const byTag = {};
  html.replace(tagRE, (tag, index) => {
    const isOpen = tag.charAt(1) !== '/';
    const isComment = tag.slice(0, 4) === '<!--';
    const start = index + tag.length;
    const nextChar = html.charAt(start);
    let parent = void 0;
    if (isOpen && !isComment) {
      level++;
      current = parseTag(tag);
      if (!current.voidElement && nextChar && nextChar !== '<') {
        pushTextNode(current.children, html, start);
      }
      byTag[current.tagName] = current;
      // if we're at root, push new base node
      if (level === 0) {
        result.push(current);
      }
      parent = arr[level - 1];
      if (parent) {
        parent.children.push(current);
      }
      arr[level] = current;
    }
    if (isComment) {
      if (level < 0) {
        pushCommentNode(result, tag);
      } else {
        pushCommentNode(arr[level].children, tag);
      }
    }
    if (isComment || !isOpen || current.voidElement) {
      if (!isComment) {
        level--;
      }
      if (nextChar !== '<' && nextChar) {
        // trailing text node
        // if we're at the root, push a base text node. otherwise add as
        // a child to the current node.
        parent = level === -1 ? result : arr[level].children;
        pushTextNode(parent, html, start);
      }
    }
  });
  return result;
}

// Based on package html-parse-stringify2
// Expanded to handle webcomponents

/**
 * @param {import('../types/index').IDom['attrs']} attrs 
 * @returns {string}
 */
function attrString(attrs) {
  const buff = [];
  for (const attr of attrs) {
    buff.push(attr.name + '="' + attr.value.replace(/"/g, '&quot;') + '"');
  }
  if (!buff.length) {
    return '';
  }
  return ' ' + buff.join(' ');
}
/**
 * @param {string} buff 
 * @param {import('../types/index').IDom} doc 
 * @returns {string}
 */
function stringifier(buff, doc) {
  switch (doc.type) {
    case 'text':
      return buff + doc.content;
    case 'tag':
      buff += '<' + doc.name + (doc.attrs ? attrString(doc.attrs) : '') + (doc.voidElement ? '/>' : '>');
      if (doc.voidElement) {
        return buff;
      }
      return buff + doc.children.reduce(stringifier, '') + '</' + doc.name + '>';
    case 'comment':
      return buff += '<!--' + doc.content + '-->';
  }
}
/**
 * @param {import('../types/index').IDom[]} doc 
 * @returns {string}
 */
function stringify(doc) {
  return doc.reduce(function (token, rootEl) {
    return token + stringifier('', rootEl);
  }, '');
}
const cache = new Map();
// Based on https://github.com/WebReflection/domtagger/blob/master/esm/sanitizer.js
const VOID_ELEMENTS = /^(?:area|base|br|col|embed|hr|img|input|keygen|link|menuitem|meta|param|source|track|wbr)$/i;
const spaces = " \\f\\n\\r\\t";
const almostEverything = "[^" + spaces + "\\/>\"'=]+";
const attrName = "[ " + spaces + "]+(?:use:<!--#-->|" + almostEverything + ")";
const tagName = "<([A-Za-z$#]+[A-Za-z0-9:_-]*)((?:";
const attrPartials = "(?:\\s*=\\s*(?:'[^']*?'|\"[^\"]*?\"|\\([^)]*?\\)|<[^>]*?>|" + almostEverything + "))?)";
const attrSeeker = new RegExp(tagName + attrName + attrPartials + "+)([ " + spaces + "]*/?>)", "g");
const findAttributes = new RegExp("(" + attrName + "\\s*=\\s*)(<!--#-->|['\"(]([\\w\\s]*<!--#-->[\\w\\s]*)*['\")])", "gi");
const selfClosing = new RegExp(tagName + attrName + attrPartials + "*)([ " + spaces + "]*/>)", "g");
const marker = "<!--#-->";
const reservedNameSpaces = new Set(["class", "on", "style", "use", "prop", "attr"]);
function attrReplacer($0, $1, $2, $3) {
  return "<" + $1 + $2.replace(findAttributes, replaceAttributes) + $3;
}
function replaceAttributes($0, $1, $2) {
  return $1.replace(/<!--#-->/g, "###") + ($2[0] === '"' || $2[0] === "'" ? $2.replace(/<!--#-->/g, "###") : '"###"');
}
function fullClosing($0, $1, $2) {
  return VOID_ELEMENTS.test($1) ? $0 : "<" + $1 + $2 + "></" + $1 + ">";
}
function parseDirective(name, value, tag, options) {
  if (name === "use:###" && value === "###") {
    const count = options.counter++;
    options.exprs.push(`typeof exprs[${count}] === "function" ? r.use(exprs[${count}], ${tag}, exprs[${options.counter++}]) : (()=>{throw new Error("use:### must be a function")})()`);
  } else {
    throw new Error(`Not support syntax ${name} must be use:{function}`);
  }
}
function createHTML(r, {
  delegateEvents = true,
  functionBuilder = (...args) => new Function(...args)
} = {}) {
  let uuid = 1;
  r.wrapProps = props => {
    const d = Object.getOwnPropertyDescriptors(props);
    for (const k in d) {
      if (typeof d[k].value === "function" && !d[k].value.length) r.dynamicProperty(props, k);
    }
    return props;
  };
  r.resolveFn = fn => typeof fn === "function" ? fn() : fn;
  function createTemplate(statics, opt) {
    let i = 0,
      markup = "";
    for (; i < statics.length - 1; i++) {
      markup = markup + statics[i] + "<!--#-->";
    }
    markup = markup + statics[i];
    const replaceList = [[selfClosing, fullClosing], [/<(<!--#-->)/g, "<###"], [/\.\.\.(<!--#-->)/g, "###"], [attrSeeker, attrReplacer], [/>\n+\s*/g, ">"], [/\n+\s*</g, "<"], [/\s+</g, " <"], [/>\s+/g, "> "]];
    markup = replaceList.reduce((acc, x) => {
      // if (typeof x[1] === 'string') {
      //   return acc.replace(x[0], x[1]);
      // }
      // @ts-expect-error - TS doesn't like the replace function, you can uncomment the above code to see that everything is fine
      return acc.replace(x[0], x[1]);
    }, markup);
    const pars = parse(markup);
    const [html, code] = parseTemplate(pars, opt.funcBuilder),
      templates = [];
    for (let i = 0; i < html.length; i++) {
      templates.push(document.createElement("template"));
      templates[i].innerHTML = html[i];
      const nomarkers = templates[i].content.querySelectorAll("script,style");
      for (let j = 0; j < nomarkers.length; j++) {
        const d = nomarkers[j].firstChild?.data || "";
        if (d.indexOf(marker) > -1) {
          const parts = d.split(marker).reduce((memo, p, i) => {
            i && memo.push("");
            memo.push(p);
            return memo;
          }, []);
          nomarkers[i].firstChild.replaceWith(...parts);
        }
      }
    }
    templates[0].create = code;
    cache.set(statics, templates);
    return templates;
  }
  function parseKeyValue(node, tag, name, value, isSVG, options) {
    let expr, parts, namespace;
    if (value === "###") {
      expr = `_$v`;
      options.counter++;
    } else {
      const chunks = value.split("###");
      options.counter = chunks.length - 1 + options.counter;
      expr = chunks.map((v, i) => i ? ` + _$v[${i - 1}] + "${v}"` : `"${v}"`).join("");
    }
    if ((parts = name.split(":")) && parts[1] && reservedNameSpaces.has(parts[0])) {
      name = parts[1];
      namespace = parts[0];
    }
    const isChildProp = r.ChildProperties.has(name);
    const isProp = r.Properties.has(name);
    if (name === "style") {
      options.exprs.push(`r.style(${tag},${expr},_$p)`);
    } else if (name === "class") {
      options.exprs.push(`r.className(${tag},${expr},${isSVG},_$p)`);
    } else if (namespace !== "attr" && (isChildProp || !isSVG && (r.getPropAlias(name, node.name.toUpperCase()) || isProp) || namespace === "prop")) {
      options.exprs.push(`${tag}.${r.getPropAlias(name, node.name.toUpperCase()) || name} = ${expr}`);
    } else {
      const ns = isSVG && name.indexOf(":") > -1 && r.SVGNamespace[name.split(":")[0]];
      if (ns) options.exprs.push(`r.setAttributeNS(${tag},"${ns}","${name}",${expr})`);else options.exprs.push(`r.setAttribute(${tag},"${name}",${expr})`);
    }
  }
  function parseAttribute(node, tag, name, value, isSVG, options) {
    if (name.slice(0, 2) === "on") {
      if (!name.includes(":")) {
        const lc = name.slice(2).toLowerCase();
        const delegate = delegateEvents && r.DelegatedEvents.has(lc);
        options.exprs.push(`r.addEventListener(${tag},"${lc}",exprs[${options.counter++}],${delegate})`);
        delegate && options.delegatedEvents.add(lc);
      } else {
        options.exprs.push(`${tag}.addEventListener("${name.slice(3)}",exprs[${options.counter++}])`);
      }
    } else if (name === "ref") {
      options.exprs.push(`exprs[${options.counter++}](${tag})`);
    } else {
      const childOptions = Object.assign({}, options, {
          exprs: []
        }),
        count = options.counter;
      parseKeyValue(node, tag, name, value, isSVG, childOptions);
      options.decl.push(`_fn${count} = (_$v, _$p) => {\n${childOptions.exprs.join(";\n")};\n}`);
      if (value === "###") {
        options.exprs.push(`typeof exprs[${count}] === "function" ? r.effect(() => exprs[${count}](), _fn${count}) : _fn${count}(exprs[${count}])`);
      } else {
        let check = "";
        let list = "";
        let reactiveList = "";
        for (let i = count; i < childOptions.counter; i++) {
          if (i !== count) {
            check += " || ";
            list += ",";
            reactiveList += ",";
          }
          check += `typeof exprs[${i}] === "function"`;
          list += `exprs[${i}]`;
          reactiveList += `r.resolveFn(exprs[${i}])`;
        }
        options.exprs.push(check + ` ? r.effect(() => [${reactiveList}], _fn${count}) : _fn${count}([${list}])`);
      }
      options.counter = childOptions.counter;
      options.wrap = false;
    }
  }
  function processChildren(node, options) {
    const childOptions = Object.assign({}, options, {
      first: true,
      multi: false,
      parent: options.path
    });
    if (node.children.length > 1) {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === "comment" && child.content === "#" || child.type === "tag" && child.name === "###") {
          childOptions.multi = true;
          break;
        }
      }
    }
    let i = 0;
    while (i < node.children.length) {
      const child = node.children[i];
      if (child.name === "###") {
        if (childOptions.multi) {
          node.children[i] = {
            type: "comment",
            content: "#"
          };
          i++;
        } else node.children.splice(i, 1);
        processComponent(child, childOptions);
        continue;
      }
      parseNode(child, childOptions);
      if (!childOptions.multi && child.type === "comment" && child.content === "#") node.children.splice(i, 1);else i++;
    }
    options.counter = childOptions.counter;
    options.templateId = childOptions.templateId;
    options.hasCustomElement = options.hasCustomElement || childOptions.hasCustomElement;
    options.isImportNode = options.isImportNode || childOptions.isImportNode;
  }
  function processComponentProps(propGroups) {
    let result = [];
    for (const props of propGroups) {
      if (Array.isArray(props)) {
        if (!props.length) continue;
        result.push(`r.wrapProps({${props.join(",") || ""}})`);
      } else result.push(props);
    }
    return result.length > 1 ? `r.mergeProps(${result.join(",")})` : result[0];
  }
  function processComponent(node, options) {
    let props = [];
    const keys = Object.keys(node.attrs),
      propGroups = [props],
      componentIdentifier = options.counter++;
    for (let i = 0; i < keys.length; i++) {
      const {
        type,
        name,
        value
      } = node.attrs[i];
      if (type === "attr") {
        if (name === "###") {
          propGroups.push(`exprs[${options.counter++}]`);
          propGroups.push(props = []);
        } else if (value === "###") {
          props.push(`${name}: exprs[${options.counter++}]`);
        } else props.push(`${name}: "${value}"`);
      } else if (type === "directive") {
        const tag = `_$el${uuid++}`;
        const topDecl = !options.decl.length;
        options.decl.push(topDecl ? "" : `${tag} = ${options.path}.${options.first ? "firstChild" : "nextSibling"}`);
        parseDirective(name, value, tag, options);
      }
    }
    if (node.children.length === 1 && node.children[0].type === "comment" && node.children[0].content === "#") {
      props.push(`children: () => exprs[${options.counter++}]`);
    } else if (node.children.length) {
      const children = {
          type: "fragment",
          children: node.children
        },
        childOptions = Object.assign({}, options, {
          first: true,
          decl: [],
          exprs: [],
          parent: false
        });
      parseNode(children, childOptions);
      props.push(`children: () => { ${childOptions.exprs.join(";\n")}}`);
      options.templateId = childOptions.templateId;
      options.counter = childOptions.counter;
    }
    let tag;
    if (options.multi) {
      tag = `_$el${uuid++}`;
      options.decl.push(`${tag} = ${options.path}.${options.first ? "firstChild" : "nextSibling"}`);
    }
    if (options.parent) options.exprs.push(`r.insert(${options.parent}, r.createComponent(exprs[${componentIdentifier}],${processComponentProps(propGroups)})${tag ? `, ${tag}` : ""})`);else options.exprs.push(`${options.fragment ? "" : "return "}r.createComponent(exprs[${componentIdentifier}],${processComponentProps(propGroups)})`);
    options.path = tag;
    options.first = false;
  }
  function parseNode(node, options) {
    if (node.type === "fragment") {
      const parts = [];
      node.children.forEach(child => {
        if (child.type === "tag") {
          if (child.name === "###") {
            const childOptions = Object.assign({}, options, {
              first: true,
              fragment: true,
              decl: [],
              exprs: []
            });
            processComponent(child, childOptions);
            parts.push(childOptions.exprs[0]);
            options.counter = childOptions.counter;
            options.templateId = childOptions.templateId;
            return;
          }
          options.templateId++;
          const id = uuid;
          const childOptions = Object.assign({}, options, {
            first: true,
            decl: [],
            exprs: []
          });
          options.templateNodes.push([child]);
          parseNode(child, childOptions);
          parts.push(`function() { ${childOptions.decl.join(",\n") + ";\n" + childOptions.exprs.join(";\n") + `;\nreturn _$el${id};\n`}}()`);
          options.counter = childOptions.counter;
          options.templateId = childOptions.templateId;
        } else if (child.type === "text") {
          parts.push(`"${child.content}"`);
        } else if (child.type === "comment") {
          if (child.content === "#") parts.push(`exprs[${options.counter++}]`);else if (child.content) {
            for (let i = 0; i < child.content.split("###").length - 1; i++) {
              parts.push(`exprs[${options.counter++}]`);
            }
          }
        }
      });
      options.exprs.push(`return [${parts.join(", \n")}]`);
    } else if (node.type === "tag") {
      const tag = `_$el${uuid++}`;
      const topDecl = !options.decl.length;
      const templateId = options.templateId;
      options.decl.push(topDecl ? "" : `${tag} = ${options.path}.${options.first ? "firstChild" : "nextSibling"}`);
      const isSVG = r.SVGElements.has(node.name);
      options.hasCustomElement = node.name.includes("-") || node.attrs.some(e => e.name === "is");
      options.isImportNode = (node.name === "img" || node.name === "iframe") && node.attrs.some(e => e.name === "loading" && e.value === "lazy");
      if (node.attrs.some(e => e.name === "###")) {
        const spreadArgs = [];
        let current = "";
        const newAttrs = [];
        for (let i = 0; i < node.attrs.length; i++) {
          const {
            type,
            name,
            value
          } = node.attrs[i];
          if (type === "attr") {
            if (value.includes("###")) {
              let count = options.counter++;
              current += `${name}: ${name !== "ref" ? `typeof exprs[${count}] === "function" ? exprs[${count}]() : ` : ""}exprs[${count}],`;
            } else if (name === "###") {
              if (current.length) {
                spreadArgs.push(`()=>({${current}})`);
                current = "";
              }
              spreadArgs.push(`exprs[${options.counter++}]`);
            } else {
              newAttrs.push(node.attrs[i]);
            }
          } else if (type === "directive") {
            parseDirective(name, value, tag, options);
          }
        }
        node.attrs = newAttrs;
        if (current.length) {
          spreadArgs.push(`()=>({${current}})`);
        }
        options.exprs.push(`r.spread(${tag},${spreadArgs.length === 1 ? `typeof ${spreadArgs[0]} === "function" ? r.mergeProps(${spreadArgs[0]}) : ${spreadArgs[0]}` : `r.mergeProps(${spreadArgs.join(",")})`},${isSVG},${!!node.children.length})`);
      } else {
        for (let i = 0; i < node.attrs.length; i++) {
          const {
            type,
            name,
            value
          } = node.attrs[i];
          if (type === "directive") {
            parseDirective(name, value, tag, options);
            node.attrs.splice(i, 1);
            i--;
          } else if (type === "attr") {
            if (value.includes("###")) {
              node.attrs.splice(i, 1);
              i--;
              parseAttribute(node, tag, name, value, isSVG, options);
            }
          }
        }
      }
      options.path = tag;
      options.first = false;
      processChildren(node, options);
      if (topDecl) {
        options.decl[0] = options.hasCustomElement || options.isImportNode ? `const ${tag} = r.untrack(() => document.importNode(tmpls[${templateId}].content.firstChild, true))` : `const ${tag} = tmpls[${templateId}].content.firstChild.cloneNode(true)`;
      }
    } else if (node.type === "text") {
      const tag = `_$el${uuid++}`;
      options.decl.push(`${tag} = ${options.path}.${options.first ? "firstChild" : "nextSibling"}`);
      options.path = tag;
      options.first = false;
    } else if (node.type === "comment") {
      const tag = `_$el${uuid++}`;
      options.decl.push(`${tag} = ${options.path}.${options.first ? "firstChild" : "nextSibling"}`);
      if (node.content === "#") {
        if (options.multi) {
          options.exprs.push(`r.insert(${options.parent}, exprs[${options.counter++}], ${tag})`);
        } else options.exprs.push(`r.insert(${options.parent}, exprs[${options.counter++}])`);
      }
      options.path = tag;
      options.first = false;
    }
  }
  function parseTemplate(nodes, funcBuilder) {
    const options = {
        path: "",
        decl: [],
        exprs: [],
        delegatedEvents: new Set(),
        counter: 0,
        first: true,
        multi: false,
        templateId: 0,
        templateNodes: []
      },
      id = uuid,
      origNodes = nodes;
    let toplevel;
    if (nodes.length > 1) {
      nodes = [{
        type: "fragment",
        children: nodes
      }];
    }
    if (nodes[0].name === "###") {
      toplevel = true;
      processComponent(nodes[0], options);
    } else parseNode(nodes[0], options);
    r.delegateEvents(Array.from(options.delegatedEvents));
    const templateNodes = [origNodes].concat(options.templateNodes);
    return [templateNodes.map(t => stringify(t)), funcBuilder("tmpls", "exprs", "r", options.decl.join(",\n") + ";\n" + options.exprs.join(";\n") + (toplevel ? "" : `;\nreturn _$el${id};\n`))];
  }
  function html(statics, ...args) {
    const templates = cache.get(statics) || createTemplate(statics, {
      funcBuilder: functionBuilder
    });
    return templates[0].create(templates, args, r);
  }
  return html;
}

const booleans = ["allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls", "default", "disabled", "formnovalidate", "hidden", "indeterminate", "inert", "ismap", "loop", "multiple", "muted", "nomodule", "novalidate", "open", "playsinline", "readonly", "required", "reversed", "seamless", "selected"];
const Properties = /*#__PURE__*/new Set(["value", "readOnly", "formNoValidate", "isMap", "noModule", "playsInline", ...booleans]);
const ChildProperties = /*#__PURE__*/new Set(["innerHTML", "textContent", "innerText", "children"]);
const PropAliases = /*#__PURE__*/Object.assign(Object.create(null), {
  class: "className",
  formnovalidate: {
    $: "formNoValidate",
    BUTTON: 1,
    INPUT: 1
  },
  ismap: {
    $: "isMap",
    IMG: 1
  },
  nomodule: {
    $: "noModule",
    SCRIPT: 1
  },
  playsinline: {
    $: "playsInline",
    VIDEO: 1
  },
  readonly: {
    $: "readOnly",
    INPUT: 1,
    TEXTAREA: 1
  }
});
function getPropAlias(prop, tagName) {
  const a = PropAliases[prop];
  return typeof a === "object" ? a[tagName] ? a["$"] : undefined : a;
}

// list of Element events that will be delegated
const DelegatedEvents = /*#__PURE__*/new Set(["beforeinput", "click", "dblclick", "contextmenu", "focusin", "focusout", "input", "keydown", "keyup", "mousedown", "mousemove", "mouseout", "mouseover", "mouseup", "pointerdown", "pointermove", "pointerout", "pointerover", "pointerup", "touchend", "touchmove", "touchstart"]);
const SVGElements = /*#__PURE__*/new Set([
// "a",
"altGlyph", "altGlyphDef", "altGlyphItem", "animate", "animateColor", "animateMotion", "animateTransform", "circle", "clipPath", "color-profile", "cursor", "defs", "desc", "ellipse", "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feImage", "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight", "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence", "filter", "font", "font-face", "font-face-format", "font-face-name", "font-face-src", "font-face-uri", "foreignObject", "g", "glyph", "glyphRef", "hkern", "image", "line", "linearGradient", "marker", "mask", "metadata", "missing-glyph", "mpath", "path", "pattern", "polygon", "polyline", "radialGradient", "rect",
// "script",
"set", "stop",
// "style",
"svg", "switch", "symbol", "text", "textPath",
// "title",
"tref", "tspan", "use", "view", "vkern"]);
const SVGNamespace = {
  xlink: "http://www.w3.org/1999/xlink",
  xml: "http://www.w3.org/XML/1998/namespace"
};

const sharedConfig = {};
function createComponent(Comp, props) {
  return untrack(() => Comp(props));
}

// Slightly modified version of: https://github.com/WebReflection/udomdiff/blob/master/index.js
function reconcileArrays(parentNode, a, b) {
  let bLength = b.length,
    aEnd = a.length,
    bEnd = bLength,
    aStart = 0,
    bStart = 0,
    after = a[aEnd - 1].nextSibling,
    map = null;
  while (aStart < aEnd || bStart < bEnd) {
    // common prefix
    if (a[aStart] === b[bStart]) {
      aStart++;
      bStart++;
      continue;
    }
    // common suffix
    while (a[aEnd - 1] === b[bEnd - 1]) {
      aEnd--;
      bEnd--;
    }
    // append
    if (aEnd === aStart) {
      const node = bEnd < bLength ? bStart ? b[bStart - 1].nextSibling : b[bEnd - bStart] : after;
      while (bStart < bEnd) parentNode.insertBefore(b[bStart++], node);
      // remove
    } else if (bEnd === bStart) {
      while (aStart < aEnd) {
        if (!map || !map.has(a[aStart])) a[aStart].remove();
        aStart++;
      }
      // swap backward
    } else if (a[aStart] === b[bEnd - 1] && b[bStart] === a[aEnd - 1]) {
      const node = a[--aEnd].nextSibling;
      parentNode.insertBefore(b[bStart++], a[aStart++].nextSibling);
      parentNode.insertBefore(b[--bEnd], node);
      a[aEnd] = b[bEnd];
      // fallback to map
    } else {
      if (!map) {
        map = new Map();
        let i = bStart;
        while (i < bEnd) map.set(b[i], i++);
      }
      const index = map.get(a[aStart]);
      if (index != null) {
        if (bStart < index && index < bEnd) {
          let i = aStart,
            sequence = 1,
            t;
          while (++i < aEnd && i < bEnd) {
            if ((t = map.get(a[i])) == null || t !== index + sequence) break;
            sequence++;
          }
          if (sequence > index - bStart) {
            const node = a[aStart];
            while (bStart < index) parentNode.insertBefore(b[bStart++], node);
          } else parentNode.replaceChild(b[bStart++], a[aStart++]);
        } else aStart++;
      } else a[aStart++].remove();
    }
  }
}

const $$EVENTS = "_$DX_DELEGATE";
function delegateEvents(eventNames, document = window.document) {
  const e = document[$$EVENTS] || (document[$$EVENTS] = new Set());
  for (let i = 0, l = eventNames.length; i < l; i++) {
    const name = eventNames[i];
    if (!e.has(name)) {
      e.add(name);
      document.addEventListener(name, eventHandler);
    }
  }
}
function setAttribute(node, name, value) {
  if (value == null) node.removeAttribute(name);else node.setAttribute(name, value);
}
function setAttributeNS(node, namespace, name, value) {
  if (value == null) node.removeAttributeNS(namespace, name);else node.setAttributeNS(namespace, name, value);
}
function setBoolAttribute(node, name, value) {
  if (isHydrating(node)) return;
  value ? node.setAttribute(name, "") : node.removeAttribute(name);
}
function className(node, value, isSVG, prev) {
  if (value == null) {
    prev && node.removeAttribute("class");
    return;
  }
  if (typeof value === "string") {
    value !== prev && (isSVG ? node.setAttribute("class", value) : node.className = value);
    return;
  }
  if (typeof prev === "string") {
    prev = {};
    node.removeAttribute("class");
  } else prev = classListToObject(prev || {});
  value = classListToObject(value);
  const classKeys = Object.keys(value || {});
  const prevKeys = Object.keys(prev);
  let i, len;
  for (i = 0, len = prevKeys.length; i < len; i++) {
    const key = prevKeys[i];
    if (!key || key === "undefined" || value[key]) continue;
    toggleClassKey(node, key, false);
  }
  for (i = 0, len = classKeys.length; i < len; i++) {
    const key = classKeys[i],
      classValue = !!value[key];
    if (!key || key === "undefined" || prev[key] === classValue || !classValue) continue;
    toggleClassKey(node, key, true);
  }
}
function addEventListener(node, name, handler, delegate) {
  if (delegate) {
    if (Array.isArray(handler)) {
      node[`$$${name}`] = handler[0];
      node[`$$${name}Data`] = handler[1];
    } else node[`$$${name}`] = handler;
  } else if (Array.isArray(handler)) {
    const handlerFn = handler[0];
    node.addEventListener(name, handler[0] = e => handlerFn.call(node, handler[1], e));
  } else node.addEventListener(name, handler, typeof handler !== "function" && handler);
}
function style(node, value, prev) {
  if (!value) {
    prev ? setAttribute(node, "style") : value;
    return;
  }
  const nodeStyle = node.style;
  if (typeof value === "string") return nodeStyle.cssText = value;
  typeof prev === "string" && (nodeStyle.cssText = prev = undefined);
  prev || (prev = {});
  value || (value = {});
  let v, s;
  for (s in value) {
    v = value[s];
    if (v !== prev[s]) nodeStyle.setProperty(s, v);
    delete prev[s];
  }
  for (s in prev) value[s] == null && nodeStyle.removeProperty(s);
}

// TODO: make this better
function spread(node, props = {}, isSVG, skipChildren) {
  const prevProps = {};
  if (!skipChildren) {
    createRenderEffect(() => normalize(props.children, prevProps.children), value => {
      insertExpression(node, value, prevProps.children);
      prevProps.children = value;
    });
  }
  createRenderEffect(() => typeof props.ref === "function" && use(props.ref, node), () => {});
  createRenderEffect(() => {
    const newProps = {};
    for (const prop in props) {
      if (prop === "children" || prop === "ref") continue;
      newProps[prop] = props[prop];
    }
    return newProps;
  }, props => assign(node, props, isSVG, true, prevProps, true));
  return prevProps;
}
function dynamicProperty(props, key) {
  const src = props[key];
  Object.defineProperty(props, key, {
    get() {
      return src();
    },
    enumerable: true
  });
  return props;
}
function use(fn, element, arg) {
  untrack(() => fn(element, arg));
}
function insert(parent, accessor, marker, initial) {
  const multi = marker !== undefined;
  if (multi && !initial) initial = [];
  if (typeof accessor !== "function") {
    accessor = normalize(accessor, initial, multi, true);
    if (typeof accessor !== "function") return insertExpression(parent, accessor, initial, marker);
  }
  createRenderEffect(prev => normalize(accessor, prev, multi), (value, current) => insertExpression(parent, value, current, marker), initial);
}
function assign(node, props, isSVG, skipChildren, prevProps = {}, skipRef = false) {
  props || (props = {});
  for (const prop in prevProps) {
    if (!(prop in props)) {
      if (prop === "children") continue;
      prevProps[prop] = assignProp(node, prop, null, prevProps[prop], isSVG, skipRef);
    }
  }
  for (const prop in props) {
    if (prop === "children") {
      if (!skipChildren) insertExpression(node, props.children);
      continue;
    }
    const value = props[prop];
    prevProps[prop] = assignProp(node, prop, value, prevProps[prop], isSVG, skipRef);
  }
}

// Internal Functions
function isHydrating(node) {
  return !!sharedConfig.context && !sharedConfig.done && (!node || node.isConnected);
}
function toggleClassKey(node, key, value) {
  const classNames = key.trim().split(/\s+/);
  for (let i = 0, nameLen = classNames.length; i < nameLen; i++) node.classList.toggle(classNames[i], value);
}
function classListToObject(classList) {
  if (Array.isArray(classList)) {
    const result = {};
    for (let i = 0, len = classList.length; i < len; i++) {
      const key = classList[i];
      if (typeof key === "object" && key != null) Object.assign(result, key);else if (key || key === 0) result[key] = true;
    }
    return result;
  }
  return classList;
}
function assignProp(node, prop, value, prev, isSVG, skipRef) {
  let propAlias, forceProp;
  if (prop === "style") return style(node, value, prev), value;
  if (prop === "class") return className(node, value, isSVG, prev), value;
  if (value === prev) return prev;
  if (prop === "ref") {
    if (!skipRef) value(node);
  } else if (prop.slice(0, 3) === "on:") {
    const e = prop.slice(3);
    prev && node.removeEventListener(e, prev, typeof prev !== "function" && prev);
    value && node.addEventListener(e, value, typeof value !== "function" && value);
  } else if (prop.slice(0, 2) === "on") {
    const name = prop.slice(2).toLowerCase();
    const delegate = DelegatedEvents.has(name);
    if (!delegate && prev) {
      const h = Array.isArray(prev) ? prev[0] : prev;
      node.removeEventListener(name, h);
    }
    if (delegate || value) {
      addEventListener(node, name, value, delegate);
      delegate && delegateEvents([name]);
    }
  } else if (prop.slice(0, 5) === "attr:") {
    setAttribute(node, prop.slice(5), value);
  } else if (prop.slice(0, 5) === "bool:") {
    setBoolAttribute(node, prop.slice(5), value);
  } else if ((forceProp = prop.slice(0, 5) === "prop:") || ChildProperties.has(prop) || !isSVG && (propAlias = getPropAlias(prop, node.tagName)) || Properties.has(prop)) {
    if (forceProp) prop = prop.slice(5);else node[propAlias || prop] = value;
  } else {
    const ns = isSVG && prop.indexOf(":") > -1 && SVGNamespace[prop.split(":")[0]];
    if (ns) setAttributeNS(node, ns, prop, value);else setAttribute(node, prop, value);
  }
  return value;
}
function eventHandler(e) {
  if (sharedConfig.registry && sharedConfig.events) {
    if (sharedConfig.events.find(([el, ev]) => ev === e)) return;
  }
  let node = e.target;
  const key = `$$${e.type}`;
  const oriTarget = e.target;
  const oriCurrentTarget = e.currentTarget;
  const retarget = value => Object.defineProperty(e, "target", {
    configurable: true,
    value
  });
  const handleNode = () => {
    const handler = node[key];
    if (handler && !node.disabled) {
      const data = node[`${key}Data`];
      data !== undefined ? handler.call(node, data, e) : handler.call(node, e);
      if (e.cancelBubble) return;
    }
    node.host && typeof node.host !== "string" && !node.host._$host && node.contains(e.target) && retarget(node.host);
    return true;
  };
  const walkUpTree = () => {
    while (handleNode() && (node = node._$host || node.parentNode || node.host));
  };

  // simulate currentTarget
  Object.defineProperty(e, "currentTarget", {
    configurable: true,
    get() {
      return node || document;
    }
  });
  // cancel hydration
  if (sharedConfig.registry && !sharedConfig.done) sharedConfig.done = _$HY.done = true;
  if (e.composedPath) {
    const path = e.composedPath();
    retarget(path[0]);
    for (let i = 0; i < path.length - 2; i++) {
      node = path[i];
      if (!handleNode()) break;
      if (node._$host) {
        node = node._$host;
        // bubble up from portal mount instead of composedPath
        walkUpTree();
        break;
      }
      if (node.parentNode === oriCurrentTarget) {
        break; // don't bubble above root of event delegation
      }
    }
  }
  // fallback for browsers that don't support composedPath
  else walkUpTree();
  // Mixing portals and shadow dom can lead to a nonstandard target, so reset here.
  retarget(oriTarget);
}
function insertExpression(parent, value, current, marker) {
  if (value === current) return;
  const t = typeof value,
    multi = marker !== undefined;
  // is this necessary anymore?
  // parent = (multi && current[0] && current[0].parentNode) || parent;

  if (t === "string" || t === "number") {
    const tc = typeof current;
    if (tc === "string" || tc === "number") {
      parent.firstChild.data = value;
    } else parent.textContent = value;
  } else if (value === undefined) {
    cleanChildren(parent, current, marker);
  } else if (value.nodeType) {
    if (Array.isArray(current)) {
      cleanChildren(parent, current, multi ? marker : null, value);
    } else if (current === undefined || !parent.firstChild) {
      parent.appendChild(value);
    } else parent.replaceChild(value, parent.firstChild);
  } else if (Array.isArray(value)) {
    const currentArray = current && Array.isArray(current);
    if (value.length === 0) {
      cleanChildren(parent, current, marker);
    } else if (currentArray) {
      if (current.length === 0) {
        appendNodes(parent, value, marker);
      } else reconcileArrays(parent, current, value);
    } else {
      current && cleanChildren(parent);
      appendNodes(parent, value);
    }
  } else console.warn(`Unrecognized value. Skipped inserting`, value);
}
function normalize(value, current, multi, doNotUnwrap) {
  value = flatten(value, {
    skipNonRendered: true,
    doNotUnwrap
  });
  if (doNotUnwrap && typeof value === "function") return value;
  if (multi && value != null && !Array.isArray(value)) value = [value];
  if (Array.isArray(value)) {
    for (let i = 0, len = value.length; i < len; i++) {
      const item = value[i],
        prev = current && current[i],
        t = typeof item;
      if (t === "string" || t === "number") value[i] = prev && prev.nodeType === 3 && prev.data === item ? prev : document.createTextNode(item);
    }
  }
  return value;
}
function appendNodes(parent, array, marker = null) {
  for (let i = 0, len = array.length; i < len; i++) parent.insertBefore(array[i], marker);
}
function cleanChildren(parent, current, marker, replacement) {
  if (marker === undefined) return parent.textContent = "";
  if (current.length) {
    let inserted = false;
    for (let i = current.length - 1; i >= 0; i--) {
      const el = current[i];
      if (replacement !== el) {
        const isParent = el.parentNode === parent;
        if (replacement && !inserted && !i) isParent ? parent.replaceChild(replacement, el) : parent.insertBefore(replacement, marker);else isParent && el.remove();
      } else inserted = true;
    }
  } else if (replacement) parent.insertBefore(replacement, marker);
}

const html = createHTML({
  effect: createRenderEffect,
  style,
  insert,
  untrack,
  spread,
  createComponent,
  delegateEvents,
  className,
  mergeProps: merge,
  dynamicProperty,
  setAttribute,
  setAttributeNS,
  addEventListener,
  getPropAlias,
  Properties,
  ChildProperties,
  DelegatedEvents,
  SVGElements,
  SVGNamespace
});

export { html };
