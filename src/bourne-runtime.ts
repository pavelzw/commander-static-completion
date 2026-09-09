// Shell source is kept in TypeScript so tsc produces a self-contained package.
export function bourneRuntime(shell: "bash" | "zsh"): string {
  return `${filterRuntime}\n${shell === "bash" ? bashDecode + bashWrapper : ""}__PREFIX__${shell === "bash" ? "_complete" : ""}() {
${shell === "zsh" ? zshInput : bashInput}
  local state=0 position=0 operands=0 end=0 pending= pending_value=-1 pending_variadic=0
  local passthrough positional negative default_command consume join_next=0
  # Isolate regex checks below: Bash/Zsh otherwise overwrite caller match variables.
  local number_pattern='^-([0-9]+|[0-9]*[.][0-9]+)(e[+-]?[0-9]+)?$'
  local combine mode value=-1 variadic=0 next kind word current flag rest attached
  local i j count=0 candidate lead= cluster_prefix= raw_current="\${COMP_WORDS[COMP_CWORD]}"
  local -a tokens candidates flags alternatives
  COMPREPLY=()
  __PREFIX___settings

  # Direct scanner callers may supply split assignments without a source line.
  for ((i=1; i<=COMP_CWORD; i++)); do
    word=\${COMP_WORDS[i]}
    if [[ -z $COMP_LINE ]] && ((count > 0)) && [[ $word == = && \${tokens[count-1]} == --* ]]; then
      tokens[count-1]+='='
      join_next=1
    elif ((join_next)) && [[ $word != = ]]; then
      tokens[count-1]+=$word
      join_next=0
    else
      tokens[count]=$word
      ((count+=1))
    fi
  done
  current=\${tokens[count-1]}

  __PREFIX___filter
  for ((i=0; i<count-1; i++)); do
    word=\${tokens[i]}
    if (( ! end )) && [[ $word == -- ]]; then end=1; continue; fi
    if ((operands == 0)); then
      __PREFIX___child "$word"
      consume=1
      if [[ -z $next ]] && ((default_command >= 0)); then next=$default_command; consume=0; fi
      if [[ -n $next ]]; then
        state=$next; position=0
        tokens=("\${tokens[@]:$((i+consume))}")
        count=\${#tokens[@]}; i=-1
        __PREFIX___settings
        __PREFIX___filter
        continue
      fi
    fi
    ((operands+=1))
    if ((passthrough)); then end=1; fi
    __PREFIX___argument
    if (( ! variadic )); then ((position+=1)); fi
  done

  # Until an operand commits a route, offer explicit commands and the default
  # command's initial completions. A known parent option still owns its value.
  while ((operands == 0 && default_command >= 0)) && [[ -z $pending ]]; do
    if (( ! end )) && [[ $current == -?* ]]; then
      if [[ $current == --* ]]; then
        __PREFIX___option "\${current%%=*}"
      else
        rest=\${current:1}; attached=
        while [[ -n $rest ]]; do
          __PREFIX___option "-\${rest:0:1}"
          if [[ -z $mode ]]; then
            cluster_prefix+=$attached
            current=-$rest
            break
          fi
          [[ $mode == required || ( $mode == optional && ( $combine == 1 || \${#rest} == 1 ) ) ]] && break
          attached+=\${rest:0:1}; rest=\${rest:1}
        done
      fi
      [[ -n $mode ]] && break
    fi
    __PREFIX___suggestions
    alternatives+=("\${candidates[@]}")
    if (( ! end )); then alternatives+=("\${flags[@]}"); fi
    state=$default_command
    __PREFIX___settings
  done

  value=-1
  if [[ -n $pending ]] && { [[ $pending == required || $current != -* || $current == - ]] || { ((negative)) && ( [[ $current =~ $number_pattern ]] ); }; }; then
    value=$pending_value
  elif (( ! end )) && [[ $current == --*=* ]]; then
    __PREFIX___option "\${current%%=*}"
    if [[ -z $mode || $mode == boolean ]]; then return 0; fi
    lead=\${current%%=*}=
    current=\${current#*=}
    # Native Bash trims the actual replacement prefix after generating candidates.
    if [[ -z $COMP_LINE && $COMP_WORDBREAKS == *=* && $raw_current != --*=* ]]; then lead=; fi
  elif (( ! end )) && [[ $current == -?* && $current != --* ]]; then
    rest=\${current:1}; attached=-
    while [[ -n $rest ]]; do
      flag=-\${rest:0:1}; attached+=\${rest:0:1}; rest=\${rest:1}
      __PREFIX___option "$flag"
      if [[ -z $mode ]]; then value=-1; break; fi
      if [[ ( $mode == required || ( $mode == optional && $combine == 1 ) ) && -n $rest ]]; then lead=$attached; current=$rest; break; fi
      value=-1
    done
  fi

${shell === "bash" ? bashUnquote : ""}
  if ((value >= 0)); then
    __PREFIX___values
  else
    __PREFIX___suggestions
    if ((operands > 0)); then candidates=(); fi
    if (( ! end )); then candidates+=("\${flags[@]}"); fi
    local -a base=("\${alternatives[@]}" "\${candidates[@]}")
    __PREFIX___argument
    __PREFIX___values
    candidates=("\${base[@]}" "\${candidates[@]}")
  fi
  if [[ -n $cluster_prefix && -n $lead ]]; then lead=-$cluster_prefix\${lead#-}; fi
${shell === "zsh" ? "  local description has_descriptions=0\n  local -a display\n" : ""}  for candidate in "\${candidates[@]}"; do
${
  shell === "zsh"
    ? `    __PREFIX___description "\${candidate%%:*}"
    candidate=\${candidate#*:}\n`
    : ""
}    [[ $candidate == "$current"* ]] || continue
    if [[ -n $cluster_prefix && -z $lead && $candidate == -?* && $candidate != --* ]]; then candidate=-$cluster_prefix\${candidate#-}; fi
    local duplicate=0 existing
    for existing in "\${COMPREPLY[@]}"; do [[ $existing == "$lead$candidate" ]] && duplicate=1; done
    ((duplicate)) || COMPREPLY+=("$lead$candidate")
${
  shell === "zsh"
    ? `    if (( ! duplicate )); then
      if [[ -n $description ]]; then
        display+=("$lead$candidate -- $description"); has_descriptions=1
      else
        display+=("$lead$candidate")
      fi
    fi\n`
    : ""
}  done
${shell === "bash" ? bashFiles : zshOutput}
  return 0
}
`;
}

// Bash 3.2 has no function-local shell options. Keep a small outer wrapper so
// every scanner return restores the caller's options, including early exits.
const bashWrapper = `__PREFIX__() {
  local _csc_nounset=0 _csc_nocasematch=0 _csc_status=0
  case $- in *u*) _csc_nounset=1 ;; esac
  if shopt -q nocasematch; then _csc_nocasematch=1; fi
  set +u
  shopt -u nocasematch
  if __PREFIX___complete "$@"; then :; else _csc_status=$?; fi
  if ((_csc_nocasematch)); then shopt -s nocasematch; fi
  if ((_csc_nounset)); then set -u; fi
  return "$_csc_status"
}
`;

const bashFiles = String.raw`  if [[ $kind == file || $kind == directory ]]; then
    local action=file search=$current
    # compgen expands a leading tilde even when the user quoted or escaped it.
    # Keep './' in the result: Readline can otherwise expand the literal tilde
    # during insertion, even when completing inside quotes on newer Bash.
    if ((literal_tilde)); then search=./$current; fi
    [[ $kind == directory ]] && action=directory
    while IFS= read -r candidate; do
      # After trimming a word-break prefix, Readline cannot stat the original
      # directory. Preserve its slash before returning the replacement suffix.
      if [[ -n $COMP_LINE && -d $candidate && $candidate != */ ]]; then candidate+=/; fi
      COMPREPLY+=("$lead$candidate")
    done < <(compgen -A "$action" -- "$search")
    # compopt is a Bash 4+ builtin. Never resolve an external command on 3.2.
    if ((BASH_VERSINFO[0] >= 4)); then compopt -o filenames 2>/dev/null || :; fi
    if ((BASH_VERSINFO[0] >= 4 && __DOLLAR__{#COMPREPLY[@]} == 1)) && [[ __DOLLAR__{COMPREPLY[0]} == */ ]]; then
      compopt -o nospace 2>/dev/null || :
    fi
  fi
  # Readline can replace only the suffix after a configured word break. Remove
  # the already-present prefix from both static candidates and filesystem paths.
  if [[ -n $readline_prefix ]]; then
    for ((j=0; j<__DOLLAR__{#COMPREPLY[@]}; j++)); do
      COMPREPLY[j]=__DOLLAR__{COMPREPLY[j]#"$readline_prefix"}
    done
  fi
  if ((BASH_VERSINFO[0] >= 4)) && [[ $kind != file && $kind != directory && -n $COMP_LINE ]] && compopt -o noquote +o filenames 2>/dev/null; then
    # Quote static words ourselves: newer Readline can preserve expansion syntax
    # even with filename quoting enabled. Bash 3.2 uses registration-time quoting.
    for ((j=0; j<__DOLLAR__{#COMPREPLY[@]}; j++)); do
      candidate=__DOLLAR__{COMPREPLY[j]}
      if [[ $quote_char == "'" ]]; then
        candidate=__DOLLAR__{candidate//\'/\'\\\'\'}
        COMPREPLY[j]="$candidate'"
      elif [[ $quote_char == '"' ]]; then
        local k quoted=
        for ((k=0; k<__DOLLAR__{#candidate}; k++)); do
          char=__DOLLAR__{candidate:k:1}
          if [[ $char == '$' || $char == $'\x60' || $char == '"' || $char == \\ ]]; then quoted+='\'; fi
          quoted+=$char
        done
        COMPREPLY[j]=$quoted'"'
      else
        printf -v 'COMPREPLY[j]' '%q' "$candidate"
      fi
    done
  fi
`.replaceAll("__DOLLAR__", "$");

// COMP_WORDS retains quoting characters. Decode syntax without evaluating any
// parameter expansion, command substitution, or other user-supplied shell code.
const bashDecode = String.raw`__PREFIX___decode() {
  local part=$1 char escaped=0 offset
  decoded=; quote_char=
  for ((offset=0; offset<__DOLLAR__{#part}; offset++)); do
    char=__DOLLAR__{part:offset:1}
    if ((escaped)); then
      if [[ $quote_char == '"' && $char != '$' && $char != $'\x60' && $char != '"' && $char != \\ && $char != $'\n' ]]; then decoded+='\'; fi
      decoded+=$char; escaped=0
    elif [[ $char == \\ && $quote_char != "'" ]]; then escaped=1
    elif [[ -z $quote_char && ( $char == "'" || $char == '"' ) ]]; then quote_char=$char
    elif [[ -n $quote_char && $char == "$quote_char" ]]; then quote_char=
    else decoded+=$char
    fi
  done
  ((escaped)) && decoded+='\'
  return 0
}
`.replaceAll("__DOLLAR__", "$");

const bashUnquote = String.raw`  if [[ -n $COMP_LINE ]]; then
    local decoded char quote_char path_raw=$current
    __PREFIX___decode "$readline_prefix"
    readline_prefix=$decoded
    __PREFIX___decode "$current"
    current=$decoded
    if [[ $current == '~'* && $path_raw != '~'* ]]; then literal_tilde=1; fi
  fi
`.replaceAll("__DOLLAR__", "$");

const zshInput = `  emulate -L ksh
  local -a COMP_WORDS=("\${(@Q)words[@]}") COMPREPLY
  local COMP_CWORD=$((CURRENT - 1)) COMP_WORDBREAKS=
  # Ignore text after the cursor in the current token.
  COMP_WORDS[COMP_CWORD]=\${(Q)PREFIX}`;

// Readline replaces only the part before point, but COMP_WORDS includes the
// entire token (including closing quotes). Match its literal boundaries without
// evaluating shell syntax, then scan and quote only the prefix being replaced.
const bashInput = String.raw`  local -a COMP_WORDS=("__DOLLAR__{COMP_WORDS[@]}")
  local COMP_CWORD=$COMP_CWORD readline_prefix= literal_tilde=0
  if [[ -n $COMP_LINE && -n $COMP_POINT ]]; then
    local before after
    # Bash 4.3+ counts characters; older versions report a byte offset.
    if ((BASH_VERSINFO[0] > 4 || (BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] >= 3))); then
      before=__DOLLAR__{COMP_LINE:0:COMP_POINT}
    else
      printf -v before '%.*s' "$COMP_POINT" "$COMP_LINE"
    fi
    after=__DOLLAR__{COMP_LINE#"$before"}
    local token=__DOLLAR__{COMP_WORDS[COMP_CWORD]} prefix suffix cut
    for ((cut=__DOLLAR__{#token}; cut>=0; cut--)); do
      prefix=__DOLLAR__{token:0:cut}; suffix=__DOLLAR__{token:cut}
      if [[ $before == *"$prefix" && $after == "$suffix"* ]]; then
        COMP_WORDS[COMP_CWORD]=$prefix
        break
      fi
    done
    # Bash versions disagree about splitting punctuation in COMP_WORDS. Join
    # only physically adjacent fragments; whitespace around '=' stays meaningful.
    local remaining=$before fragment gap index joined_count=0
    local -a joined
    for ((index=0; index<=COMP_CWORD; index++)); do
      fragment=__DOLLAR__{COMP_WORDS[index]}
      if [[ -n $fragment ]]; then
        [[ $remaining == *"$fragment"* ]] || { COMPREPLY=(); return 0; }
        gap=__DOLLAR__{remaining%%"$fragment"*}
        remaining=__DOLLAR__{remaining#*"$fragment"}
      else
        gap=$remaining; remaining=
      fi
      if ((joined_count > 0)) && [[ -z $gap ]]; then
        joined[joined_count-1]+=$fragment
      else
        joined[joined_count]=$fragment
        ((joined_count+=1))
      fi
    done
    COMP_WORDS=("__DOLLAR__{joined[@]}")
    COMP_CWORD=$((joined_count-1))
    # Decode committed tokens too, so inserted quoted names route correctly.
    local decoded quote_char
    for ((index=1; index<COMP_CWORD; index++)); do
      __PREFIX___decode "__DOLLAR__{COMP_WORDS[index]}"
      COMP_WORDS[index]=$decoded
    done
    # $2 is Readline's replacement text. It can be shorter than the logical word
    # even on Bash 3.2, where COMP_WORDS retains punctuation within each word.
    token=__DOLLAR__{COMP_WORDS[COMP_CWORD]}
    if (($# >= 2)) && [[ $token == *"$2" ]]; then
      readline_prefix=__DOLLAR__{token%"$2"}
    fi
  fi`.replaceAll("__DOLLAR__", "$");

const zshOutput = `  emulate -L zsh
  # Restore compinit options before calling native completion helpers.
  if ((\${#_comp_options[@]})); then setopt "\${_comp_options[@]}"; fi
  if ((\${#COMPREPLY[@]})); then
    if ((has_descriptions)); then compadd -d display -- "\${COMPREPLY[@]}";
    else compadd -- "\${COMPREPLY[@]}"; fi
  fi
  if [[ $kind == file || $kind == directory ]]; then
    # Native file completion handles quoting and directory suffixes.
    if [[ -n $lead ]]; then compset -P "\${(b)lead}"; fi
    # _files can fall back to all files when no directory matches. Use the
    # lower-level helper to keep directory hints strict, including symlinks.
    if [[ $kind == directory ]]; then _path_files -/; else _files; fi
  fi`;

const filterRuntime = `__PREFIX___filter() {
  local p seen=0 token rest attached=0
  local -a filtered
  pending=; pending_value=-1; pending_variadic=0
  if ((end)); then return; fi
  for ((p=0; p<count-1; p++)); do
    token=\${tokens[p]}
    if [[ -n $pending ]]; then
      if [[ $pending == required || $token != -* || $token == - ]] || { ((negative)) && ( [[ $token =~ $number_pattern ]] ); }; then
        if ((pending_variadic)); then pending=optional; else pending=; fi
        continue
      fi
      pending=
    fi
    if [[ $token == -- ]]; then
      filtered+=("\${tokens[@]:$p:$((count-1-p))}")
      break
    fi
    __PREFIX___local_option "$token"
    attached=0
    if [[ -z $mode && $token == --*=* ]]; then
      __PREFIX___local_option "\${token%%=*}"
      if [[ $mode == boolean ]]; then mode=; fi
      attached=1
    elif [[ -z $mode && $token == -?* && $token != --* ]]; then
      rest=\${token:1}
      while [[ -n $rest ]]; do
        __PREFIX___local_option "-\${rest:0:1}"
        if [[ -z $mode ]]; then token=-$rest; break; fi
        rest=\${rest:1}
        if [[ $mode == required || ( $mode == optional && ( $combine == 1 || -z $rest ) ) ]]; then
          [[ -n $rest ]] && attached=1
          break
        fi
      done
    fi
    if [[ -n $mode ]]; then
      if [[ $mode != boolean ]] && (( ! attached )); then
        pending=$mode; pending_value=$value; pending_variadic=$variadic
      fi
      continue
    fi
    if (((positional || passthrough) && seen == 0)); then
      __PREFIX___child "$token"
      if [[ -n $next ]] || ((default_command >= 0)); then
        filtered+=("$token" "\${tokens[@]:$((p+1)):$((count-2-p))}")
        break
      fi
    fi
    filtered+=("$token")
    ((seen+=1))
    if ((passthrough)); then
      filtered+=("\${tokens[@]:$((p+1)):$((count-2-p))}")
      break
    fi
  done
  if [[ -n $pending ]] && { [[ $pending == required || $current != -* || $current == - ]] || { ((negative)) && ( [[ $current =~ $number_pattern ]] ); }; }; then
    # Ancestor options consume values before a child ever sees the remaining words.
    tokens=("$current"); count=1
  else
    pending=
    tokens=("\${filtered[@]}" "$current"); count=\${#tokens[@]}
  fi
}
`;
