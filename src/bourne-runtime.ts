// Shell source is kept in TypeScript so tsc produces a self-contained package.
export function bourneRuntime(shell: "bash" | "zsh"): string {
  return `${filterRuntime}\n__PREFIX__() {
${shell === "zsh" ? zshInput : ""}
  local state=0 position=0 operands=0 end=0 pending= pending_value=-1 pending_variadic=0
  local passthrough positional negative default_command consume join_next=0
  local number_pattern='^-([0-9]+|[0-9]*[.][0-9]+)(e[+-]?[0-9]+)?$'
  local mode value=-1 variadic=0 next kind word current flag rest attached
  local i j count=0 candidate lead= cluster_prefix= raw_current="\${COMP_WORDS[COMP_CWORD]}"
  local -a tokens candidates flags alternatives
  COMPREPLY=()
  __PREFIX___settings

  # Bash normally splits '=' into its own word. Reassemble option assignments.
  for ((i=1; i<=COMP_CWORD; i++)); do
    word=\${COMP_WORDS[i]}
    if ((count > 0)) && [[ $word == = && \${tokens[count-1]} == --* ]]; then
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
          [[ $mode != boolean ]] && break
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
  if [[ -n $pending ]] && { [[ $pending == required || $current != -* || $current == - ]] || { ((negative)) && [[ $current =~ $number_pattern ]]; }; }; then
    value=$pending_value
  elif (( ! end )) && [[ $current == --*=* ]]; then
    __PREFIX___option "\${current%%=*}"
    if [[ -z $mode || $mode == boolean ]]; then return 0; fi
    lead=\${current%%=*}=
    current=\${current#*=}
    # Readline replaces only the part after '=' when it is a word break.
    if [[ $COMP_WORDBREAKS == *=* && ( -n $COMP_LINE || $raw_current != --*=* ) ]]; then lead=; fi
  elif (( ! end )) && [[ $current == -?* && $current != --* ]]; then
    rest=\${current:1}; attached=-
    while [[ -n $rest ]]; do
      flag=-\${rest:0:1}; attached+=\${rest:0:1}; rest=\${rest:1}
      __PREFIX___option "$flag"
      if [[ -z $mode ]]; then value=-1; break; fi
      if [[ $mode != boolean && -n $rest ]]; then lead=$attached; current=$rest; break; fi
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
  for candidate in "\${candidates[@]}"; do
    [[ $candidate == "$current"* ]] || continue
    if [[ -n $cluster_prefix && -z $lead && $candidate == -?* && $candidate != --* ]]; then candidate=-$cluster_prefix\${candidate#-}; fi
    local duplicate=0 existing
    for existing in "\${COMPREPLY[@]}"; do [[ $existing == "$lead$candidate" ]] && duplicate=1; done
    ((duplicate)) || COMPREPLY+=("$lead$candidate")
  done
${shell === "bash" ? bashFiles : zshOutput}
  return 0
}
`;
}

const bashFiles = String.raw`  if [[ $kind == file || $kind == directory ]]; then
    local action=file
    [[ $kind == directory ]] && action=directory
    while IFS= read -r candidate; do
      COMPREPLY+=("$lead$candidate")
    done < <(compgen -A "$action" -- "$current")
    compopt -o filenames 2>/dev/null || :
  elif [[ -n $COMP_LINE ]] && compopt -o noquote +o filenames 2>/dev/null; then
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
const bashUnquote = String.raw`  if [[ -n $COMP_LINE ]]; then
    local decoded= char quote_char= escaped=0
    for ((j=0; j<__DOLLAR__{#current}; j++)); do
      char=__DOLLAR__{current:j:1}
      if ((escaped)); then
        if [[ $quote_char == '"' && $char != '$' && $char != $'\x60' && $char != '"' && $char != \\ && $char != $'\n' ]]; then
          decoded+='\'
        fi
        decoded+=$char; escaped=0
      elif [[ $char == \\ && $quote_char != "'" ]]; then
        escaped=1
      elif [[ -z $quote_char && ( $char == "'" || $char == '"' ) ]]; then
        quote_char=$char
      elif [[ -n $quote_char && $char == "$quote_char" ]]; then
        quote_char=
      else
        decoded+=$char
      fi
    done
    ((escaped)) && decoded+='\'
    current=$decoded
  fi
`.replaceAll("__DOLLAR__", "$");

const zshInput = `  emulate -L ksh
  local -a COMP_WORDS=("\${words[@]}") COMPREPLY
  local COMP_CWORD=$((CURRENT - 1)) COMP_WORDBREAKS=
  # Ignore text after the cursor in the current token.
  COMP_WORDS[COMP_CWORD]=\${(Q)PREFIX}`;

const zshOutput = `  emulate -L zsh
  # Restore compinit options before calling native completion helpers.
  if ((\${#_comp_options[@]})); then setopt "\${_comp_options[@]}"; fi
  if ((\${#COMPREPLY[@]})); then compadd -- "\${COMPREPLY[@]}"; fi
  if [[ $kind == file || $kind == directory ]]; then
    # Native file completion handles quoting and directory suffixes.
    if [[ -n $lead ]]; then compset -P "\${(b)lead}"; fi
    if [[ $kind == directory ]]; then _files -/; else _files; fi
  fi`;

const filterRuntime = `__PREFIX___filter() {
  local p seen=0 token rest attached=0
  local -a filtered
  pending=; pending_value=-1; pending_variadic=0
  if ((end)); then return; fi
  for ((p=0; p<count-1; p++)); do
    token=\${tokens[p]}
    if [[ -n $pending ]]; then
      if [[ $pending == required || $token != -* || $token == - ]] || { ((negative)) && [[ $token =~ $number_pattern ]]; }; then
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
        if [[ $mode != boolean ]]; then
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
        filtered+=("\${tokens[@]:$p:$((count-1-p))}")
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
  if [[ -n $pending ]] && { [[ $pending == required || $current != -* || $current == - ]] || { ((negative)) && [[ $current =~ $number_pattern ]]; }; }; then
    # Ancestor options consume values before a child ever sees the remaining words.
    tokens=("$current"); count=1
  else
    pending=
    tokens=("\${filtered[@]}" "$current"); count=\${#tokens[@]}
  fi
}
`;
