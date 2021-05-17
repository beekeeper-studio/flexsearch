/**!
 * FlexSearch.js
 * Copyright 2019 Nextapps GmbH
 * Author: Thomas Wilkerling
 * Licence: Apache-2.0
 * https://github.com/nextapps-de/flexsearch
 */

import { SUPPORT_ASYNC, SUPPORT_CACHE, SUPPORT_STORE, SUPPORT_TAGS } from "./config.js";
import Index from "./index.js";
import Cache, { searchCache } from "./cache.js";
import { create_object } from "./common.js";
import { addAsync, appendAsync, removeAsync, searchAsync, updateAsync } from "./async.js";
import { intersect, intersect_union } from "./intersect.js";

/**
 * @param {Object=} options
 * @return {Document}
 * @constructor
 */

function Document(options){

    if(!(this instanceof Document)) {

        return new Document(options);
    }

    let opt;

    options || (options = {});

    this.tree = [];
    this.field = [];
    this.marker = [];
    this.register = create_object();
    this.key = ((opt = options["key"]) && parse_tree(opt, this.marker)) || "id";
    this.fastupdate = parse_option(options["fastupdate"], true);

    if(SUPPORT_STORE){

        this.store = (opt = options["store"]) && create_object();
        this.storetree = opt && (opt !== true) && [];
    }

    if(SUPPORT_TAGS){

        this.tag = ((opt = options["tag"]) && parse_tree(opt, this.marker));
        this.tagindex = opt && create_object();
    }

    if(SUPPORT_CACHE){

        this.cache = (opt = options["cache"]) && new Cache(opt);
        options["cache"] = false;
    }

    /** @private */
    this.index = parse_descriptor.call(this, options);
}

export default Document;

function parse_option(value, default_value){

    return typeof value !== "undefined" ? value : default_value;
}

/**
 * @this Document
 */

function parse_descriptor(options){

    const index = create_object();
    let field = options["doc"]; // options["document"]
    let field_options;

    if(typeof field === "string"){

        field = [field];
    }
    else if(field.constructor !== Array){

        field_options = field;
        field = Object.keys(field);
    }

    for(let i = 0, key, item; i < field.length; i++){

        key = field[i];

        if(field_options){

            item = field_options[key];
            item = typeof item === "object" ? Object.assign({}, options, item) : options;
        }
        else{

            item = options;
        }

        index[key] = new Index(item, this.register);
        this.tree[i] = parse_tree(key, this.marker);
        this.field[i] = key;
    }

    if(SUPPORT_STORE && this.storetree){

        let store = options["store"];

        if(typeof store === "string"){

            store = [store];
        }

        for(let i = 0; i < store.length; i++){

            this.storetree[i] = parse_tree(store[i], this.marker);
        }
    }

    return index;
}

function parse_tree(key, marker){

    const tree = key.split(":");
    let count = 0;

    for(let i = 0; i < tree.length; i++){

        key = tree[i];

        if(key.indexOf("[]") >= 0){

            key = key.substring(0, key.length - 2);

            if(key){

                marker[count] = true;
            }
        }

        if(key){

            tree[count++] = key;
        }
    }

    if(count < tree.length){

        tree.length = count;
    }

    return count > 1 ? tree : tree[0];
}

function parse_simple(obj, tree){

    if(typeof tree === "string"){

        obj = obj[tree];
    }
    else{

        for(let i = 0; obj && (i < tree.length); i++){

            obj = obj[tree[i]];
        }
    }

    return obj;
}

function store_value(obj, store, tree, pos, key){

    obj = obj[key];

    // reached target field

    if(pos === (tree.length - 1)){

        // store target value

        store[key] = obj;
    }
    else if(obj){

        if(obj.constructor === Array){

            store = store[key] = new Array(obj.length);

            for(let i = 0; i < obj.length; i++){

                // do not increase pos (an array is not a field)
                store_value(obj, store, tree, pos, i);
            }
        }
        else{

            store = store[key] || (store[key] = create_object());
            key = tree[++pos];

            store_value(obj, store, tree, pos, key);
        }
    }
}

function add_index(obj, tree, marker, pos, index, id, key, _append){

    obj = obj[key];

    // reached target field

    if(pos === (tree.length - 1)){

        // handle target value

        if(obj.constructor === Array){

            if(marker[pos]){

                for(let i = 0; i < obj.length; i++){

                    index.add(id, obj[i], true);
                }

                return;
            }

            obj = obj.join(" ");
        }

        index.add(id, obj, _append);
    }
    else if(obj){

        if(obj.constructor === Array){

            for(let i = 0; i < obj.length; i++){

                // do not increase index, an array is not a field
                add_index(obj, tree, marker, pos, index, id, i, _append);
            }
        }
        else{

            key = tree[++pos];

            add_index(obj, tree, marker, pos, index, id, key, _append);
        }
    }
}

/**
 *
 * @param id
 * @param content
 * @param {boolean=} _append
 * @returns {Document}
 */

Document.prototype.add = function(id, content, _append){

    if(typeof id === "object"){

        content = id;
        id = parse_simple(content, this.key);
    }

    if(content && (id || (id === 0))){

        if(this.register[id]){

            return this.update(id, content);
        }

        for(let i = 0, tree, field; i < this.field.length; i++){

            field = this.field[i];
            tree = this.tree[i];

            if(typeof tree === "string"){

                tree = [tree];
            }

            add_index(content, tree, this.marker, 0, this.index[field], id, tree[0], _append);
        }

        if(SUPPORT_TAGS && this.tag){

            let tag = parse_simple(content, this.tag);
            let dupes = create_object();

            if(typeof tag === "string"){

                tag = [tag];
            }

            for(let i = 0, key, arr; i < tag.length; i++){

                key = tag[i];

                if(!dupes[key]){

                    dupes[key] = 1;
                    arr = this.tagindex[key] || (this.tagindex[key] = []);

                    if(!_append || (arr.indexOf(id) === -1)){

                        arr[arr.length] = id;

                        // add a reference to the register for fast updates

                        if(this.fastupdate){

                            const tmp = this.register[id] || (this.register[id] = []);
                            tmp[tmp.length] = arr;
                        }
                    }
                }
            }
        }

        if(SUPPORT_STORE && this.store){

            let store;

            if(this.storetree){

                store = create_object();

                for(let i = 0, tree; i < this.storetree.length; i++){

                    tree = this.storetree[i];

                    if(typeof tree === "string"){

                        store[tree] = content[tree];
                    }
                    else{

                        store_value(content, store, tree, 0, tree[0]);
                    }
                }
            }

            this.store[id] = store || content;
        }

    }

    return this;
};

Document.prototype.append = function(id, content){

    return this.add(id, content, true);
};

Document.prototype.update = function(id, content){

   return this.remove(id).add(id, content);
};

Document.prototype.remove = function(id){

    if(typeof id === "object"){

        id = id[this.key];
    }

    if(this.register[id]){

        for(let i = 0; i < this.field.length; i++){

            this.index[this.field[i]].remove(id, true);
        }

        if(SUPPORT_TAGS && this.tag){

            // when fastupdate was enabled the id will be already cleanup by the index

            if(!this.fastupdate){

                for(let key in this.tagindex){

                    const tag = this.tagindex[key];
                    const pos = tag.indexOf(id);

                    if(pos !== -1){

                        if(tag.length > 1){

                            tag.splice(pos, 1);
                        }
                        else{

                            delete this.tagindex[key];
                        }
                    }
                }
            }
        }

        if(SUPPORT_STORE && this.store){

            delete this.store[id];
        }

        delete this.register[id];
    }

    return this;
};

Document.prototype.search = function(query, limit, options){

    if(typeof query === "object"){

        options = query;
        query = options["query"];
    }
    else if(typeof limit === "object"){

        options = limit;
    }

    let result = [];
    let pluck, enrich;
    let field, field_options, tag, bool, count = 0;

    if(options){

        pluck = options["pluck"];
        field = pluck || options["field"];
        tag = SUPPORT_TAGS && options["tag"];
        enrich = SUPPORT_STORE && this.store && options["enrich"];
        bool = options["bool"] === "and";
        limit = options["limit"];

        if(field){

            if(typeof field === "string"){

                field = [field];
            }
            else if(field.constructor !== Array){

                field_options = field;
                field = Object.keys(field);
            }
        }

        if(tag){

            if(typeof tag === "string"){

                tag = [tag];
            }

            // when tags is used and no query was set,
            // then just return the tag indexes

            if(!query){

                for(let i = 0, res; i < tag.length; i++){

                    res = get_tag.call(this, tag[i], limit || 100, enrich);

                    if(res){

                        result[result.length] = res;
                        count++;
                    }
                }

                return count ? result : [];
            }
        }
    }

    field || (field = this.field);
    bool = bool && ((field.length > 1) || (tag && (tag.length > 1)));

    let found_tag = [];

    // TODO solve this in one loop below

    for(let i = 0, res, key, item, len; i < field.length; i++){

        key = field[i];

        // if(field_options){
        //
        //     item = field_options[key];
        //
        //     // inherit options also when search? it is just for laziness, Object.assign() has a cost
        //     //item = typeof item === "object" ? Object.assign({}, options, item) : options;
        // }
        // else{
        //
        //     item = options;
        // }

        res = this.index[key].search(query, limit, field_options ? field_options[key] : options);
        len = res.length;

        if(tag && len){

            const field_tag = found_tag[i] = [];
            const arr = [];
            let count = 0;

            if(bool){

                // prepare for intersection

                arr[0] = [res];
            }

            for(let y = 0, key, res; y < tag.length; y++){

                key = tag[y];
                res = this.tagindex[key];
                len = res && res.length;

                if(len){

                    arr[arr.length] = bool ? [res] : res;
                    field_tag[count++] = key;
                }
            }

            if(count){

                if(bool){

                    res = intersect(arr, limit || 100);
                }
                else{

                    res = intersect_union(res, arr);
                }

                len = res.length;
            }
        }

        if(len){

            result[count++] = res;
        }
        else if(bool){

            //if(!len){

                return [];
            //}

            // add a pseudo relevance index for the intersection
            // used when squash the results on boolean "and"
            //res = [res];
        }
    }

    if(!count){

        // fast path "not found"

        return [];
    }

    // squash the results on boolean "and"?

    // if(bool){
    //
    //     limit || (limit = 100);
    //
    //     if(enrich && this.store){
    //
    //         return apply_enrich.call(this, intersect(result, limit));
    //     }
    //
    //     return intersect(result, limit);
    // }

    if(pluck && (!enrich || !this.store)){

        // fast path optimization

        return result[0];
    }

    for(let i = 0, res, key; i < field.length; i++){

        key = field[i];
        res = result[i];

        if(res.length){

            if(enrich){

                res = apply_enrich.call(this, res);
            }
        }

        if(pluck){

            return res;
        }

        result[i] = res = {

            "field": key,
            "result": res
        };

        if(tag){

            res["tag"] = found_tag[i];
        }
    }

    return result;
};

/**
 * @this Document
 */

function get_tag(key, limit, enrich){

    let res = this.tagindex[key];
    let len = res && res.length;

    if(len){

        if(len > limit){

            res = res.slice(0, limit);
        }

        if(enrich){

            res = apply_enrich.call(this, res);
        }

        return {

            "tag": key,
            "result": res
        };
    }
}

/**
 * @this Document
 */

function apply_enrich(res){

    const arr = new Array(res.length);

    for(let x = 0, id; x < res.length; x++){

        id = res[x];

        arr[x] = {

            "key": id,
            "doc": this.store[id]
        };
    }

    return arr;
}

Document.prototype.contain = function(id){

    return !!this.register[id];
};

if(SUPPORT_STORE){

    Document.prototype.get = function(id){

        return this.store[id];
    };

    Document.prototype.set = function(id, data){

        this.store[id] = data;
        return this;
    };
}

if(SUPPORT_CACHE){

    Document.prototype.searchCache = searchCache;
}

if(SUPPORT_ASYNC){

    Document.prototype.addAsync = addAsync;
    Document.prototype.appendAsync = appendAsync;
    Document.prototype.searchAsync = searchAsync;
    Document.prototype.updateAsync = updateAsync;
    Document.prototype.removeAsync = removeAsync;
}